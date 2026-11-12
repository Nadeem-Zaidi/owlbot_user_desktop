import { createSlice, createAsyncThunk, type PayloadAction } from "@reduxjs/toolkit"
import { api } from "@/features/chat/api/chat_api"
import type { ContentPart, LLMMessage, Session } from "@/shared/types"



export const newSession = createAsyncThunk<{ windowId: string; session: Session },{ windowId: string },{ rejectValue: string }
>("session/new", async ({ windowId }, { rejectWithValue }) => {
    try {
        const session = await api.newSession();
        return { windowId, session };
    } catch (err: any) {
        return rejectWithValue(err.message ?? "error in creating new session");
    }
});

// Global — one shared session list across all windows (e.g. for a history sidebar)
export const loadSessions = createAsyncThunk<Session[], void, { rejectValue: string }>(
    "session/loadAll",
    async (_, { rejectWithValue }) => {
        try {
            const sessions = await api.getSessions();
            return sessions;
        } catch (err: any) {
            return rejectWithValue(err.message ?? "error in loading history");
        }
    }
);

// Global — pins (favourites) or unpins a chat. The sidebar updates at once and
// rolls back if the server refuses (e.g. too many pinned chats).
export const setSessionPinned = createAsyncThunk<
    { sessionId: string; pinned_at: string | null },
    { sessionId: string; pinned: boolean },
    { rejectValue: string }
>("session/setPinned", async ({ sessionId, pinned }, { rejectWithValue }) => {
    try {
        const r = await api.setPinned(sessionId, pinned);
        return { sessionId, pinned_at: r.pinned_at };
    } catch (err) {
        return rejectWithValue(err instanceof Error ? err.message : "Couldn't update the pin");
    }
});

// Global — deletes a session everywhere; any window pointing at it gets cleared below
export const deleteSession = createAsyncThunk<string, string, { rejectValue: string }>(
    "session/delete",
    async (sessionId, { rejectWithValue }) => {
        try {
            await api.deleteSession(sessionId); // don't rely on its return value
            return sessionId;                   // return what you know you deleted
        } catch (err: any) {
            return rejectWithValue(err.message ?? "error in deleting history");
        }
    }
);

export const loadMessages = createAsyncThunk<
    { windowId: string; messages: Array<Record<string, any>> },
    { windowId: string; sessionId: string },
    { rejectValue: string }
>("session/loadMessages", async ({ windowId, sessionId }, { rejectWithValue }) => {
    try {
        const messages = await api.getMessages(sessionId);
        return { windowId, messages };
    } catch (err: any) {
        return rejectWithValue(err.message ?? "error in loading messages");
    }
});

export const switchSession = createAsyncThunk<
    { windowId: string; session: Session },
    { windowId: string; sessionId: string },
    { rejectValue: string }
>("session/switch", async ({ windowId, sessionId }, { rejectWithValue }) => {
    try {
        const session = await api.getSession(sessionId);
        return { windowId, session };
    } catch (err: any) {
        return rejectWithValue(err.message ?? "error in loading session");
    }
});

// Reads/creates a session for a given window, persisted per-window in sessionStorage
// so a page refresh can restore each chat box to the session it was on.
export const loadOrCreateSession = createAsyncThunk<
    { windowId: string; session: Session },
    { windowId: string; name: string },
    { rejectValue: string }
>("session/loadOrCreate", async ({ windowId, name }, { dispatch, rejectWithValue }) => {
    try {
        const raw = sessionStorage.getItem("sessions");
        const stored = raw ? JSON.parse(raw) : {};

        if (stored[name]) {
            return { windowId, session: stored[name].session as Session };
        }

        const result = await dispatch(newSession({ windowId }));
        if (newSession.rejected.match(result)) {
            return rejectWithValue(result.payload ?? "error creating session");
        }

        const created = result.payload.session;
        stored[name] = { id: created.id, session: created, messages: [], chatMode: false };
        sessionStorage.setItem("sessions", JSON.stringify(stored));
        return { windowId, session: created };
    } catch (err: any) {
        return rejectWithValue(err.message ?? "error loading session");
    }
});

const readChatMode = (windowId: string): boolean => {
    try {
        return sessionStorage.getItem(`chat_mode_${windowId}`) !== null;
    } catch {
        return false;
    }
};

const readActiveSessionId = (windowId: string): string | null => {
    try {
        return sessionStorage.getItem(`active_session_id_${windowId}`);
    } catch {
        return null;
    }
};

interface ChatWindowState {
    activeSessionId: string | null;
    chatMode: boolean;
    chatMessages: LLMMessage[];
    cacheChatMessages: LLMMessage[];
    status: "idle" | "loading" | "error";
}

interface SessionState {
    sessions: Session[]; // shared across all windows
    status: "idle" | "loading" | "error"; // status of the shared sessions list
    // True once the list has loaded (or failed) at least once. Later
    // refreshes (tab focus, new chat) keep showing the old list instead of
    // the loading skeleton.
    sessionsLoaded: boolean;
    windows: Record<string, ChatWindowState>;
    // Global — sessionIds that currently have a response streaming, whether
    // or not any window has that session open right now. This is what lets
    // the sidebar show a "still generating" indicator on a chat the user
    // has navigated away from, and what ChatPage reads to know if THIS
    // window's active session is the one mid-stream.
    streamingSessionIds: string[];
}

const emptyWindow = (windowId: string): ChatWindowState => ({
    activeSessionId: readActiveSessionId(windowId),
    chatMode: readChatMode(windowId),
    chatMessages: [],
    cacheChatMessages: [],
    status: "idle",
});

const initialState: SessionState = {
    sessions: [],
    status: "idle",
    sessionsLoaded: false,
    windows: {},
    streamingSessionIds: [],
};

// Safety net: if a component dispatches into a window before calling
// openWindow (e.g. mount-order race), create it on the fly instead of
// crashing on `state.windows[windowId].foo`.
const ensureWindow = (state: SessionState, windowId: string): ChatWindowState => {
    if (!state.windows[windowId]) {
        state.windows[windowId] = emptyWindow(windowId);
    }
    return state.windows[windowId];
};

const sessionSlice = createSlice({
    name: "session",
    initialState,
    reducers: {
        openWindow(state, action: PayloadAction<{ windowId: string }>) {
            if (!state.windows[action.payload.windowId]) {
                state.windows[action.payload.windowId] = emptyWindow(action.payload.windowId);
            }
        },
        closeWindow(state, action: PayloadAction<{ windowId: string }>) {
            delete state.windows[action.payload.windowId];
        },
        setActiveSession(state, action: PayloadAction<{ windowId: string; sessionId: string | null }>) {
            const { windowId, sessionId } = action.payload;
            const win = ensureWindow(state, windowId);
            win.activeSessionId = sessionId;
            if (sessionId) {
                sessionStorage.setItem(`active_session_id_${windowId}`, sessionId);
            } else {
                sessionStorage.removeItem(`active_session_id_${windowId}`);
            }
        },
        setChatMode(state, action: PayloadAction<{ windowId: string; chatMode: boolean }>) {
            const { windowId, chatMode } = action.payload;
            const win = ensureWindow(state, windowId);
            win.chatMode = chatMode;
            if (chatMode) {
                sessionStorage.setItem(`chat_mode_${windowId}`, "1");
            } else {
                sessionStorage.removeItem(`chat_mode_${windowId}`);
            }
        },
        updateSessionTitle(state, action: PayloadAction<{ sessionId: string; title: string }>) {
            const session = state.sessions.find(s => s.id === action.payload.sessionId);
            if (session) {
                session.title = action.payload.title;
            }
        },
        // Marks a session as actively streaming, for anyone (sidebar, other
        // windows) to react to. Idempotent — safe to dispatch even if it's
        // already marked.
        startSessionStream(state, action: PayloadAction<{ sessionId: string }>) {
            const { sessionId } = action.payload;
            if (!state.streamingSessionIds.includes(sessionId)) {
                state.streamingSessionIds.push(sessionId);
            }
            // A new message = latest activity: move this chat to the top of Recents.
            const session = state.sessions.find((s) => s.id === sessionId);
            if (session) session.updated_at = new Date().toISOString();
        },
        endSessionStream(state, action: PayloadAction<{ sessionId: string }>) {
            const { sessionId } = action.payload;
            state.streamingSessionIds = state.streamingSessionIds.filter((id) => id !== sessionId);
        },
        appendMessage(state, action: PayloadAction<{ windowId: string; message: LLMMessage }>) {
            const { windowId, message } = action.payload;
            const win = ensureWindow(state, windowId);
            if (!win.activeSessionId) win.chatMessages = [];
            win.chatMessages = [...win.chatMessages, message];
        },
        appendCacheMessage(state, action: PayloadAction<{ windowId: string; messages: LLMMessage[] }>) {
            const { windowId, messages } = action.payload;
            const win = ensureWindow(state, windowId);
            win.cacheChatMessages = [...win.cacheChatMessages, ...messages];
        },
        clearCacheMessage(state, action: PayloadAction<{ windowId: string }>) {
            ensureWindow(state, action.payload.windowId).cacheChatMessages = [];
        },
        replaceLastMessage(state, action: PayloadAction<{ windowId: string; message: LLMMessage }>) {
            const { windowId, message } = action.payload;
            const win = ensureWindow(state, windowId);
            if (win.cacheChatMessages.length === 0) return;
            win.cacheChatMessages[win.cacheChatMessages.length - 1] = message;
        },
        setCacheMessages(state, action: PayloadAction<{ windowId: string; messages: LLMMessage[] }>) {
            const { windowId, messages } = action.payload;
            ensureWindow(state, windowId).cacheChatMessages = messages;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(newSession.fulfilled, (state, action) => {
                const { windowId, session } = action.payload;
                const win = ensureWindow(state, windowId);
                win.activeSessionId = session.id;
                sessionStorage.setItem(`active_session_id_${windowId}`, session.id);
            })
            .addCase(switchSession.fulfilled, (state, action) => {
                const { windowId, session } = action.payload;
                const win = ensureWindow(state, windowId);
                win.activeSessionId = session.id;
                sessionStorage.setItem(`active_session_id_${windowId}`, session.id);
            })
            .addCase(loadOrCreateSession.fulfilled, (state, action) => {
                const { windowId, session } = action.payload;
                const win = ensureWindow(state, windowId);
                win.activeSessionId = session.id;
                sessionStorage.setItem(`active_session_id_${windowId}`, session.id);
                if (!state.sessions.some(s => s.id === session.id)) {
                    state.sessions.unshift(session);
                }
            })
            .addCase(setSessionPinned.pending, (state, action) => {
                const s = state.sessions.find((x) => x.id === action.meta.arg.sessionId);
                if (s) s.pinned_at = action.meta.arg.pinned ? (s.pinned_at ?? new Date().toISOString()) : null;
            })
            .addCase(setSessionPinned.fulfilled, (state, action) => {
                const s = state.sessions.find((x) => x.id === action.payload.sessionId);
                if (s) s.pinned_at = action.payload.pinned_at;
            })
            .addCase(setSessionPinned.rejected, (state, action) => {
                // Undo the optimistic change.
                const s = state.sessions.find((x) => x.id === action.meta.arg.sessionId);
                if (s) s.pinned_at = action.meta.arg.pinned ? null : new Date().toISOString();
            })
            .addCase(deleteSession.fulfilled, (state, action) => {
                const deletedId = action.payload;
                state.sessions = state.sessions.filter(s => s.id !== deletedId);
                state.streamingSessionIds = state.streamingSessionIds.filter(id => id !== deletedId);
                // clear it out of every window that had it active, not just one
                for (const windowId of Object.keys(state.windows)) {
                    const win = state.windows[windowId];
                    if (win.activeSessionId === deletedId) {
                        win.activeSessionId = state.sessions[0] ? state.sessions[0].id : null;
                        win.chatMessages = [];
                        win.cacheChatMessages = [];
                    }
                }
            })
            .addCase(loadMessages.fulfilled, (state, action) => {
                const { windowId, messages } = action.payload;
                const win = ensureWindow(state, windowId);
                if (!win.activeSessionId) return;

                // FIX — a brand-new session's first message races this exact
                // reducer: the moment activeSessionId is set, ChatPage's
                // useEffect fires loadMessages() immediately, before the
                // just-sent message has reached (or been saved by) the
                // backend. That request resolves with an empty/stale list,
                // and unconditionally overwriting cacheChatMessages here
                // would wipe out the optimistically-appended user message
                // and the in-progress streamed assistant reply — the user
                // message never reappears, and replaceLastMessage silently
                // no-ops on the now-empty array (see its own early return
                // below), so the assistant's answer never lands either,
                // leaving the UI stuck on "Thinking…" forever even though
                // the stream is actually completing fine server-side. If
                // this session currently has a stream in flight, our own
                // live/optimistic cache is more up to date than this read,
                // so skip the overwrite entirely.
                if (state.streamingSessionIds.includes(win.activeSessionId)) {
                    return;
                }

                const storedMessages: LLMMessage[] = messages.map((message) => {
                    switch (message.role) {
                        case "user":
                            return { role: "user", content: message.content as ContentPart[] } as LLMMessage;
                        case "assistant":
                            return {
                                role: "assistant",
                                content: message.content as ContentPart[],
                                // FIX — this used to only copy `role`/`content`, silently
                                // dropping any `sources`/`source_file` field the backend
                                // might return on the assistant message. Even if the
                                // backend starts persisting sources server-side, this line
                                // is required for them to ever reach the UI on reload.
                                // Accepts either field name since different attempts in
                                // this codebase have used both.
                                ...((message as any).sources || (message as any).source_file
                                    ? { sources: (message as any).sources ?? (message as any).source_file }
                                    : {}),
                                ...(message.metadata?.usage ? { metadata: { usage: message.metadata.usage } } : {}),
                            } as LLMMessage;
                        case "tool_call":
                            return {
                                role: "tool_call",
                                name: message.name,
                                arguments: message.arguments ? message.arguments : {},
                                tool_call_id: message.tool_call_id,
                            } as LLMMessage;
                        case "tool_call_output":
                            return {
                                // FIX — this was `role: "tool"`. LLMMessage's own type
                                // declares role as 'system' | 'user' | 'assistant' | 'tool'
                                // | 'tool_call' | 'tool_call_output', and "tool" was never
                                // one of the values anything downstream actually checks for
                                // — ChatPage's RAG-source derivation (and anything else that
                                // wants to correlate a tool result back to its tool_call by
                                // role) was matching against "tool_call_output" and silently
                                // finding nothing, on every single load, because this never
                                // produced that value. Restored to match what was saved.
                                role: "tool_call_output",
                                tool_call_id: message.tool_call_id,
                                output: message.output ?? "",
                            } as LLMMessage;
                        default:
                            throw new Error(`Unsupported content type: ${message.role}`);
                    }
                });

                win.chatMessages = storedMessages;
                win.cacheChatMessages = storedMessages;
            })
            .addCase(loadSessions.pending, (state) => { state.status = "loading"; })
            .addCase(loadSessions.rejected, (state) => { state.status = "error"; state.sessionsLoaded = true; })
            .addCase(loadSessions.fulfilled, (state, action) => {
                state.sessions = action.payload;
                state.status = "idle";
                state.sessionsLoaded = true;
            });
    },
});

export const {
    openWindow,
    closeWindow,
    setActiveSession,
    setChatMode,
    startSessionStream,
    endSessionStream,
    appendMessage,
    appendCacheMessage,
    clearCacheMessage,
    replaceLastMessage,
    setCacheMessages,
    updateSessionTitle,
} = sessionSlice.actions;

export default sessionSlice.reducer;