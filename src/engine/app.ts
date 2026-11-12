import { mkdirSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import express from "express";
import { SqliteAdapter } from "./db/sqlite_adapter";
import { collectReply } from "./core/runtime/collect";
import { StudioService } from "./core/studio/studio_service";
import { createChatRouter } from "./http/chat_routes";
import { LOCAL_USER_ID, LocalUser, localAuth } from "./http/local_user";
import { createShellRouter } from "./http/shell_routes";
import { ClaudeCodeProvider } from "./llms/claude_code_provider";
import { AgentRepository } from "./repository/agent_repository";
import { AgentFileRepository } from "./repository/agent_file_repository";
import { SkillRepository } from "./repository/skill_repository";
import { createSkillRouter } from "./routes/skill_routes";
import { SkillService } from "./service/skills/skill_service";
import { useSecretsKeyDir } from "./service/agents/secrets";
import { MessageRepository } from "./repository/message_repository";
import { PipelineRepository } from "./repository/pipeline_repository";
import { SessionRepository } from "./repository/sessiopn_repository";
import { StudioRepository } from "./repository/studio_repository";
import { UsageRepository } from "./repository/usage_repository";
import { AgentRoutes } from "./routes/agent_routes";
import { PipelineRoutes } from "./routes/pipeline_routes";
import { createStudioRouter } from "./routes/studio_routes";
import { AgentScheduler } from "./service/agents/agent_scheduler";
import { AgentService } from "./service/agents/agent_service";
import { PipelineService } from "./service/agents/pipeline_service";
import { KnowledgeBase } from "./service/knowledge_base";
import { MessageService } from "./service/message_service";
import { LLMMessage } from "./types/llm_message";

export type EngineOptions = {
    // Where the database and Claude Code's working folder live.
    dataDir: string;
    // Only requests carrying this token are answered (the app's own window).
    token: string;
    // The built web UI to serve; omitted when only the API is wanted (tests).
    uiDir?: string;
    // 0 = any free port.
    port?: number;
    userName?: string;
};

export type Engine = { port: number; url: string; close(): Promise<void> };

// Everything the desktop app runs: one SQLite file, Claude Code for every
// answer, and the agents / workflows / chat API the web UI talks to — all in
// this process, listening on this computer only.
export async function startEngine(opts: EngineOptions): Promise<Engine> {
    mkdirSync(opts.dataDir, { recursive: true });
    // Saved secrets' key lives with the database, not in the start folder.
    useSecretsKeyDir(opts.dataDir);
    // Agents' HTTP functions and MCP servers may reach the company network
    // (an internal Maximo or Jira is the point here). On the server edition
    // private addresses are blocked; IT can do the same with "false".
    process.env.AGENT_ALLOW_PRIVATE_URLS ??= "true";
    const db = new SqliteAdapter(path.join(opts.dataDir, "owl.db"));
    await db.connect();

    const user: LocalUser = { uid: LOCAL_USER_ID, sub: LOCAL_USER_ID, name: opts.userName || "You", email: "you@this-computer" };

    const messages = new MessageService(new SessionRepository(db), new MessageRepository(db));
    const usage = new UsageRepository(db);
    const llm = new ClaudeCodeProvider({ messageService: messages, usage, workDir: path.join(opts.dataDir, "claude-workdir") });
    const ask = async (userId: string, sessionId: string, prompt: string, signal: AbortSignal) => {
        const message: LLMMessage = { type: "message", role: "user", content: [{ type: "text", text: prompt }] };
        const r = await collectReply(llm.chatStream([message], userId, sessionId, "", signal));
        return { text: r.text.trim(), error: r.error ?? (r.cancelled ? "It took too long and was stopped." : null) };
    };

    const agentRepo = new AgentRepository(db);
    const skillRepo = new SkillRepository(db);
    const agents = new AgentService({
        files: new AgentFileRepository(db),
        skills: skillRepo,
        repo: agentRepo,
        messageService: messages,
        providers: new Map([["claude", llm]]),
        defaultProvider: "claude",
        kb: new KnowledgeBase(),
        // Knowledge-base search arrives with the knowledge-base step.
        vectorDb: { search: async () => [] },
        embed: { ready: false, embed: async () => [] },
        usage,
        ask,
    });
    const scheduler = new AgentScheduler(agentRepo, agents);
    const pipelines = new PipelineService(new PipelineRepository(db), agentRepo, agents, messages, undefined, { askModel: ask });
    await pipelines.init();
    const studio = new StudioService(new StudioRepository(db), agentRepo, agents, pipelines, messages);
    scheduler.start();
    studio.start();

    const app = express();
    app.disable("x-powered-by");
    // The UI is not secret; the data behind these paths is.
    const DATA_PATHS = ["/api", "/sessions", "/documents", "/document_content", "/list_files", "/upload", "/delete", "/index_files"];
    // 40 MB: files for agents arrive as base64 (25 MB files).
    app.use(DATA_PATHS, localAuth(opts.token, user), express.json({ limit: "40mb" }));
    const agentRoutes = new AgentRoutes(agents);
    agentRoutes.setScheduler(scheduler);
    app.use("/api/agents", agentRoutes.getRouter());
    app.use("/api/pipelines", new PipelineRoutes(pipelines).getRouter());
    app.use("/api/studio", createStudioRouter(studio));
    app.use("/api/skills", createSkillRouter(new SkillService(skillRepo)));
    app.use("/api", createChatRouter({ messages, agents, llm }));
    app.use(createShellRouter());
    // An API path nobody answered is a 404, never the app's page.
    app.use(DATA_PATHS, (_req, res) => res.status(404).json({ message: "Not available in the desktop app" }));
    if (opts.uiDir) {
        app.use(express.static(opts.uiDir));
        // Client-side routes (/agents, /pipelines/…) all load the app.
        app.use((req, res, next) => (req.method === "GET" ? res.sendFile(path.join(opts.uiDir!, "index.html")) : next()));
    }
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (res.headersSent) return next(err);
        const status = Number(err?.status ?? err?.statusCode) || 500;
        if (status >= 500) console.error(`[http] ${req.method} ${req.path} failed:`, err);
        res.status(status).json({ message: status >= 500 ? "Something went wrong. Please try again." : err?.message ?? "Request failed" });
    });

    const server = http.createServer(app);
    // This computer only: never reachable from the network.
    await new Promise<void>((resolve, reject) => server.once("error", reject).listen(opts.port ?? 0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    return {
        port,
        url: `http://127.0.0.1:${port}`,
        close: async () => {
            scheduler.stop();
            studio.stop();
            await new Promise<void>((resolve) => server.close(() => resolve()));
            server.closeAllConnections();
            await db.disconnect();
        },
    };
}
