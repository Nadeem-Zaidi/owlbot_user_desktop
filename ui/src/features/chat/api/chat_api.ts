import type { DocumentContent, KnowledgeDocument, LLMFileUploadResponse, LLMMessage, MessageUsage, Session, WhatsAppLinkCode, WhatsAppStatus } from "@/shared/types";
import { workspaceHeaders } from "@/shared/lib/workspace";
import { BaseApi } from "@/shared/api/base_fetch";
import { localCommandHeaders, type LocalCommandResult } from "@/shared/lib/desktop";

export type StreamChunk = {
    type:
        | "message"
        | "function_call"
        | "function_call_arguments" // matches the backend's actual event name
        | "function_call_output"
        | "mcp_call"                // remote MCP tool call started
        | "mcp_call_arguments"      // remote MCP tool call arguments finalized
        | "mcp_call_output"         // remote MCP tool call completed
        | "mcp_list_tools"          // MCP server exposed its available tools
        | "mcp_approval_request"    // MCP server requires human approval before running
        | "code_interpreter_call"            // hosted code interpreter call started
        | "code_interpreter_call_code_delta" // streamed chunk of the code being written
        | "code_interpreter_call_code_done"  // full code for this call, finalized
        | "code_interpreter_call_status"     // status update: "in_progress" | "interpreting" | "completed" | "failed"
        | "code_interpreter_file"            // a file (chart, csv, etc.) the code interpreter generated
        | "session_title"
        | "usage"                   // token totals for the turn, sent just before it ends
        | "error"
        | "cancelled"               // stream aborted via AbortController
        | "done"
        | string;
    tool_call_id?: string;
    name?: string;
    args?: string;              // mcp_call_arguments
    arguments?: string;         // function_call_arguments (what the providers send)
    output?: string;
    title?: string;
    code?: string;
    message?: string;
    content?: { type: string; text: string }[];
    isDone?: boolean;
    server_label?: string;      // which MCP server this event relates to (mcp_call, mcp_call_arguments, mcp_list_tools, mcp_approval_request)
    tools?: { name: string; description?: string }[]; // tool list from mcp_list_tools
    delta?: string;             // code_interpreter_call_code_delta
    status?: string;            // code_interpreter_call_status
    file_id?: string;           // code_interpreter_file
    container_id?: string;      // code_interpreter_file
    filename?: string;          // code_interpreter_file
    usage?: MessageUsage;       // usage
    request?: unknown;          // approval_request (provider agents' browser)
    request_id?: string;        // approval_resolved
    outcome?: string;           // approval_resolved
    image?: string;             // browser_screenshot (data URL)
};

export type LLMProviderOption = {
    id: string;            // "openai" | "anthropic" — sent back as `provider` on /chat_stream
    label: string;         // display name, e.g. "Claude"
    defaultModel: string;  // e.g. "claude-opus-5-5"
    models: { id: string; label: string }[]; // selectable models; id is sent back as `model`
    byok?: boolean;        // the user's own API key
};

// Away message for the bot's number (self-chat mode).
export type WhatsAppAway = {
    available: boolean;
    enabled: boolean;
    message: string;
    cooldown_minutes: number;
    until: string | null;
    updated_at: string | null;
    recipients?: { total: number; recent: { number: string | null; name: string | null; repliedAt: string; count: number }[] };
};

class Api extends BaseApi {
    // One per chat: several chats can stream at once (switch chats mid-reply),
    // and Stop must cancel the one you're looking at, not the latest one.
    private abortControllers = new Map<string, AbortController>();

    constructor() {
        super(import.meta.env.VITE_API_URL);
    }

    async getSessions() {
        return await this.get<Session[]>(`/load_sessions`);
    }

    async getSession(sessionId: string): Promise<Session> {
        return await this.get<Session>(`/get_session/${sessionId}`); // path param, not query
    }

    async setPinned(sessionId: string, pinned: boolean) {
        return await this.put<{ id: string; pinned_at: string | null }>(`/sessions/${encodeURIComponent(sessionId)}/pin`, { pinned });
    }

    async deleteSession(sessionId: string) {
        await this.delete(`/delete/${sessionId}`); // path param, matches backend exactly
    }

    async getMessages(sessionId: string) {
        return await this.get<LLMMessage[]>(`/load_messages/${sessionId}`); // path param, not query
    }

    async newSession():Promise<Session> {
        return await this.post<Session>("/new_session");
    }

    // The desktop app's answer to a local command request (ran / denied / unavailable).
    async answerLocalCommand(requestId: string, result: LocalCommandResult) {
        return this.post<{ ok: true }>(`/local-commands/${encodeURIComponent(requestId)}`, result);
    }

    async getProviders() {
        return await this.get<{ providers: LLMProviderOption[]; defaultProvider: string }>("/providers");
    }

    async sendMessage(
        sessionId: string,
        message: LLMMessage,
        onChunk: (chunk: StreamChunk) => void,
        selection?: { provider: string; model: string },
        // Starts (or continues) a chat with this agent; the backend attaches it to the session.
        agentId?: string,
        // Same, for a provider agent (Claude Managed Agents / OpenAI Agents API).
        nativeAgentId?: string,
        // Opt-in tool packs for this message ("documents" = Word & Excel).
        toolPacks?: string[]
    ) {
        this.abortControllers.get(sessionId)?.abort();
        const controller = new AbortController();
        this.abortControllers.set(sessionId, controller);

        try {
            await this.stream(
                "/chat_stream",
                { currentSessionId: sessionId, llmMessage: message, provider: selection?.provider, model: selection?.model, agentId, nativeAgentId, toolPacks },
                (_event, data) => onChunk(data as StreamChunk),
                controller.signal
            );
            if (!controller.signal.aborted) {
                onChunk({ type: "done", isDone: true });
            }
        } catch (err) {
            if (!controller.signal.aborted) {
                onChunk({
                    type: "error",
                    code: "stream_error",
                    message: err instanceof Error ? err.message : "Unknown streaming error",
                });
            }
        } finally {
            if (this.abortControllers.get(sessionId) === controller) this.abortControllers.delete(sessionId);
        }
    }

    // Stops one chat's reply — or every running reply when no chat is given.
    // Closing the request makes the server stop the model (and, for provider
    // agents, interrupt the remote session), so nothing keeps running or billing.
    async abortChat(sessionId?: string) {
        if (sessionId) {
            this.abortControllers.get(sessionId)?.abort();
            this.abortControllers.delete(sessionId);
            return;
        }
        for (const c of this.abortControllers.values()) c.abort();
        this.abortControllers.clear();
    }

    // Storage routes (list_files/upload/delete) are mounted at the app root
    // (see gateway/vanilla_gateway.ts: app.use("/", storageRoutes.getRouter())),
    // not under "/api" like the chat routes, so this strips the "/api" suffix
    // that VITE_API_URL carries for the chat endpoints.
    private get storageBaseUrl(): string {
        return this.baseUrl.replace(/\/api\/?$/, "");
    }

    // ── WhatsApp ──
    async getWhatsAppAway(): Promise<WhatsAppAway> {
        return this.get<WhatsAppAway>("/whatsapp/away");
    }

    async saveWhatsAppAway(body: { enabled: boolean; message: string; cooldown_minutes: number; until: string | null }): Promise<WhatsAppAway> {
        return this.put<WhatsAppAway>("/whatsapp/away", body);
    }

    async getWhatsAppStatus(): Promise<WhatsAppStatus> {
        return this.get<WhatsAppStatus>("/whatsapp/status");
    }

    // One-time code to link this account's WhatsApp number; with a sessionId
    // the phone also picks up that chat.
    async createWhatsAppLinkCode(sessionId?: string | null): Promise<WhatsAppLinkCode> {
        return this.post<WhatsAppLinkCode>("/whatsapp/link_code", sessionId ? { sessionId } : {});
    }

    // Moves a chat to an already-linked phone; returns the link to open WhatsApp.
    async continueInWhatsApp(sessionId: string): Promise<{ waLink: string }> {
        return this.post<{ waLink: string }>("/whatsapp/continue", { sessionId });
    }

    // Starts pairing the bot's own number; the QR then shows up in getWhatsAppStatus().
    async pairWhatsAppBot(): Promise<void> {
        await this.post("/whatsapp/bot/pair");
    }

    async unlinkWhatsApp(): Promise<void> {
        await this.delete("/whatsapp/link");
    }

    // Documents indexed in the user's knowledge base (one entry per file).
    async getDocuments(): Promise<KnowledgeDocument[]> {
        const data = await this.storageGet<{ documents: KnowledgeDocument[] }>("/documents");
        return data.documents;
    }

    // Full text of one indexed document; `key` is a RAG source_file or filename.
    async getDocumentContent(key: string): Promise<DocumentContent> {
        return this.storageGet<DocumentContent>(`/document_content?key=${encodeURIComponent(key)}`);
    }

    private async storageGet<T>(path: string): Promise<T> {
        const headers = await this.getHeader();
        const response = await fetch(`${this.storageBaseUrl}${path}`, {
            headers: { Authorization: headers.Authorization, ...workspaceHeaders() },
        });
        if (!response.ok) {
            let message = `Request failed (${response.status})`;
            try {
                message = (await response.json()).message ?? message;
            } catch {
                // non-JSON error body — keep the status message
            }
            throw new Error(message);
        }
        return response.json() as Promise<T>;
    }

    async uploadFile(file: File): Promise<LLMFileUploadResponse> {
        const headers = await this.getHeader();
        const authHeaders: Record<string, string> = { Authorization: headers.Authorization, ...workspaceHeaders() };

        const formData = new FormData();
        formData.append("files", file);

        const response = await fetch(`${this.storageBaseUrl}/upload`, {
            method: "POST",
            headers: authHeaders,
            body: formData,
        });

        if (!response.ok && response.status !== 207) {
            let message = "Upload failed";
            try {
                const error = await response.json();
                message = error.message ?? message;
            } catch {
                message = await response.text();
            }
            throw new Error(message);
        }

        const data = (await response.json()) as {
            uploaded: number;
            failed: number;
            results: (
                // openaiFileId is present only when this was a csv/xls/xlsx and
                // the backend successfully mirrored it to OpenAI's Files API —
                // see storage_routes.ts's uploadAndIndex().
                | { name: string; status: "uploaded"; url: string; openaiFileId?: string }
                | { name: string; status: "failed"; error: string }
            )[];
        };

        const result = data.results.find((r) => r.name === file.name);
        if (!result) {
            throw new Error("Upload response did not include this file");
        }
        if (result.status === "failed") {
            throw new Error(result.error);
        }

        return {
            name: file.name,
            extension: file.name.split(".").pop() ?? "",
            isImage: file.type.startsWith("image/"),
            // This backend is S3-backed and has no separate "file id" concept —
            // the S3 key/URL is the only identifier it hands back, so it doubles
            // as fileId here.
            fileId: result.url,
            url: result.url,
            openaiFileId: result.openaiFileId,
        };
    }

    // Fetches a file the code interpreter generated inside its container.
    // This has to go through our backend (see /code_interpreter/files/:containerId/:fileId)
    // rather than hitting OpenAI directly, since that requires the API key.
    // Returned as a Blob (not a plain URL) because the endpoint sits behind
    // the same Firebase auth as everything else, so a bare <img src="..."> or
    // <a href="..."> can't carry the Authorization header it needs.
    async getCodeInterpreterFile(
        containerId: string,
        fileId: string,
        filenameHint?: string
    ): Promise<{ blob: Blob; filename: string; contentType: string }> {
        const headers = await this.getHeader();
        const authHeaders: Record<string, string> = { Authorization: headers.Authorization, ...workspaceHeaders() };

        const response = await fetch(`${this.baseUrl}/code_interpreter/files/${containerId}/${fileId}`, {
            headers: authHeaders,
        });

        if (!response.ok) {
            let message = "Failed to fetch file";
            try {
                const error = await response.json();
                message = error.message ?? message;
            } catch {
                message = await response.text();
            }
            throw new Error(message);
        }

        const contentType = response.headers.get("Content-Type") ?? "application/octet-stream";
        const headerName = response.headers.get("X-File-Name");
        const filename = (headerName ? decodeURIComponent(headerName) : undefined) ?? filenameHint ?? fileId;
        const blob = await response.blob();
        return { blob, filename, contentType };
    }

    protected async stream(
        path: string,
        body: unknown,
        onEvent: (event: string, data: unknown) => void,
        signal?: AbortSignal
    ) {
        const url = `${this.baseUrl}${path}`;
        const headers = { ...(await this.getHeader()), ...(await localCommandHeaders()) };
        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal,
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }
        if (!response.body) {
            throw new Error("Response body is empty.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";

            for (const eventBlock of events) {
                const lines = eventBlock.split("\n");
                let event = "message";
                const dataLines: string[] = [];

                for (const line of lines) {
                    if (line.startsWith("event:")) {
                        event = line.slice(6).trim();
                    } else if (line.startsWith("data:")) {
                        dataLines.push(line.slice(5).trim());
                    }
                }

                if (dataLines.length === 0) continue;
                const data = dataLines.join("\n");

                try {
                    onEvent(event, JSON.parse(data));
                } catch {
                    onEvent(event, data);
                }
            }
        }
    }
}

export const api = new Api();