import { NextFunction, Request, Response, Router } from "express";
import { ChatRunOptions, ILLM } from "../interfaces/illm";
import { AgentService } from "../service/agents/agent_service";
import { MessageService } from "../service/message_service";
import { LLMMessage } from "../types/llm_message";
import { LocalCommandBroker } from "../core/local_commands/local_command_tool";
import { LocalCommandResult } from "../core/local_commands/run_command";

type Handler = (req: Request, res: Response) => Promise<unknown>;

const h = (fn: Handler) => (req: Request, res: Response, _next: NextFunction) => {
    fn(req, res).catch((err: any) => {
        const status = Number(err?.status ?? err?.statusCode) || 500;
        if (status >= 500) console.error("[chat] request failed:", err);
        if (!res.headersSent) res.status(status).json({ message: status >= 500 ? "Something went wrong" : err?.message ?? "Request failed" });
        else res.end();
    });
};

const MAX_PINNED = 10;
const SESSIONS_PAGE_DEFAULT = 30;
const SESSIONS_PAGE_MAX = 100;

const MODEL_LABELS: Record<string, string> = {
    default: "Claude · your plan's default",
    opus: "Claude Opus",
    sonnet: "Claude Sonnet",
    haiku: "Claude Haiku",
};

const encodeCursor = (c: { ts: string; id: string }) => Buffer.from(JSON.stringify(c)).toString("base64url");
function decodeCursor(raw: string): { ts: string; id: string } | null {
    try {
        const c = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
        return typeof c?.ts === "string" && typeof c?.id === "string" ? c : null;
    } catch {
        return null;
    }
}

// One turn at a time per chat: a second message waits for the first answer.
class Lanes {
    private tails = new Map<string, Promise<void>>();
    async acquire(sessionId: string): Promise<() => void> {
        const before = this.tails.get(sessionId) ?? Promise.resolve();
        let release!: () => void;
        const mine = new Promise<void>((r) => { release = r; });
        const tail = before.then(() => mine);
        this.tails.set(sessionId, tail);
        await before;
        return () => {
            release();
            if (this.tails.get(sessionId) === tail) this.tails.delete(sessionId);
        };
    }
}

// Chats: the same paths and answers as the web app's /api chat routes, so the
// same screens work. Every chat belongs to the one local user.
export function createChatRouter(deps: { messages: MessageService; agents: AgentService; llm: ILLM; localCommands?: LocalCommandBroker }): Router {
    const { messages, agents, llm } = deps;
    const r = Router();
    const uid = (req: Request) => req.user!.sub;
    const lanes = new Lanes();
    const models = llm.getModels?.() ?? [llm.getModel()];

    r.get("/providers", h(async (_req, res) => res.json({
        providers: [{ id: "claude", label: "Claude", byok: false, defaultModel: llm.getModel(), models: models.map((id) => ({ id, label: MODEL_LABELS[id] ?? id })) }],
        defaultProvider: "claude",
    })));

    r.get("/get_session/:sessionId", h(async (req, res) => res.json(await messages.getSession(String(req.params.sessionId), uid(req)))));

    r.get("/load_messages/:sessionId", h(async (req, res) => {
        const sessionId = String(req.params.sessionId);
        if (!(await messages.isSessionValid(sessionId, uid(req)))) return res.status(400).json({ message: "invalid sessionid" });
        res.json(await messages.loadMessages(sessionId));
    }));

    r.post("/new_session", h(async (req, res) => res.json(await messages.createSession(uid(req)))));

    r.get("/load_sessions", h(async (req, res) => res.json(await messages.getUserSessions(uid(req)))));

    r.get("/sessions", h(async (req, res) => {
        const limit = Math.min(SESSIONS_PAGE_MAX, Math.max(1, Number(req.query.limit) || SESSIONS_PAGE_DEFAULT));
        let after: { ts: string; id: string } | undefined;
        if (typeof req.query.cursor === "string" && req.query.cursor) {
            const decoded = decodeCursor(req.query.cursor);
            if (!decoded) return res.status(400).json({ message: "Invalid page cursor" });
            after = decoded;
        }
        const page = await messages.getUserSessionsPage(uid(req), limit, after);
        res.json({ sessions: page.sessions, nextCursor: page.next ? encodeCursor(page.next) : null });
    }));

    r.put("/sessions/:sessionId/pin", h(async (req, res) => {
        if (typeof req.body?.pinned !== "boolean") return res.status(400).json({ message: "pinned must be true or false" });
        if (req.body.pinned && (await messages.countPinned(uid(req))) >= MAX_PINNED) {
            return res.status(400).json({ message: `You can pin up to ${MAX_PINNED} chats — unpin one first.` });
        }
        const result = await messages.setPinned(String(req.params.sessionId), uid(req), req.body.pinned).catch(() => null);
        if (!result) return res.status(404).json({ message: "Chat not found" });
        res.json(result);
    }));

    r.delete("/delete/:sessionId", h(async (req, res) => {
        const sessionId = String(req.params.sessionId);
        if (!(await messages.isSessionValid(sessionId, uid(req)))) return res.status(400).json({ message: "invalid sessionid" });
        await messages.deleteSession(sessionId, uid(req));
        res.status(204).send(sessionId);
    }));

    // The page's answer to a command request: "unavailable" when it can't ask
    // (not in the desktop app). In the app, the app itself answers first and
    // this one is ignored.
    r.post("/local-commands/:requestId", h(async (req, res) => {
        const b = req.body ?? {};
        const result: LocalCommandResult | null =
            b.status === "denied" ? { status: "denied" }
                : b.status === "unavailable" ? { status: "unavailable", message: String(b.message ?? "Couldn't run the command.").slice(0, 500) }
                    : null;
        if (!result) return res.json({ ok: true, accepted: false });
        res.json({ ok: true, accepted: deps.localCommands?.resolve(String(req.params.requestId), result, uid(req)) ?? false });
    }));

    // One turn, streamed as server-sent events (the web app's event names).
    r.post("/chat_stream", h(async (req, res) => {
        const userId = uid(req);
        const sessionId = req.body?.currentSessionId ? String(req.body.currentSessionId) : "";
        const input = req.body?.llmMessage as LLMMessage | undefined;
        if (!sessionId || !(await messages.isSessionValid(sessionId, userId))) return res.status(400).json({ message: "invalid sessionid" });
        if (!input || input.role !== "user" || !input.content) return res.status(400).json({ message: "Send a message" });

        // A chat started from an agent's card stays with that agent.
        const agent = await agents.agentForSession(sessionId, userId, typeof req.body?.agentId === "string" ? req.body.agentId : undefined);
        let model: string;
        let run: ChatRunOptions | undefined;
        if (agent) {
            ({ model } = await agents.resolveLLM(agent, userId));
            // "X-Owl-Desktop: shell; platform=win32" = the desktop app's own
            // window, which can show the approval dialog for commands.
            const desktop = /^shell;\s*platform=([a-z0-9]+)$/i.exec(String(req.headers["x-owl-desktop"] ?? ""));
            run = await agents.buildRun(agent, desktop ? { localCommands: { platform: desktop[1] } } : {});
        } else {
            model = models.includes(req.body?.model) ? req.body.model : llm.getModel();
        }

        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.flushHeaders();
        const abort = new AbortController();
        // "close" on the response = the user pressed Stop or left.
        res.on("close", () => { if (!res.writableEnded) abort.abort(); });

        const release = await lanes.acquire(sessionId);
        try {
            for await (const chunk of llm.chatStream([{ ...input, type: "message" }], userId, sessionId, "", abort.signal, model, run)) {
                if (chunk.type) res.write(`event: ${chunk.type}\ndata: ${JSON.stringify(chunk)}\n\n`);
            }
        } finally {
            release();
        }
        res.end();
    }));

    return r;
}
