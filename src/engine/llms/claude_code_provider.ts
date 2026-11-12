import { mkdirSync } from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Options } from "@anthropic-ai/claude-agent-sdk" with { "resolution-mode": "import" };
import { ChatRunOptions, ILLM, ToolSource } from "../interfaces/illm";
import { MessageService } from "../service/message_service";
import { UsageRepository } from "../repository/usage_repository";
import { LLMMessage } from "../types/llm_message";
import { ToolContext } from "../types/type";

// Every answer in the desktop app comes from Claude Code, signed in with the
// user's own Claude account on this computer — no API key is read or sent.
//
// Claude Code runs the whole turn itself (model calls and the tool loop). It
// gets none of its own tools (no shell, no file access): only this app's
// tools, offered through an in-process MCP server. This class starts the
// turn, turns what Claude Code reports into the chat's stream events (the
// same ones the web app's providers send), and saves the messages.

const MCP_NAME = "owl";
const TOOL_PREFIX = `mcp__${MCP_NAME}__`;
const DEFAULT_MAX_TURNS = 40;
const HEARTBEAT_MS = 20_000;
// When a chat can't be resumed in Claude Code, this much of it is replayed.
const REPLAY_CHARS = 40_000;
const BASE_PROMPT = "You are Owl, an assistant in the Owl desktop app. Be direct and helpful. Answer in Markdown.";

// Selectable in the model picker. "default" is whatever the account's plan
// gives; the others are Claude Code's own aliases for the current models.
const MODELS = ["default", "opus", "sonnet", "haiku"] as const;

type Sdk = typeof import("@anthropic-ai/claude-agent-sdk", { with: { "resolution-mode": "import" } });
let sdkPromise: Promise<Sdk> | null = null;
const loadSdk = () => (sdkPromise ??= import("@anthropic-ai/claude-agent-sdk"));

// The environment Claude Code runs in: the app's own, minus anything that
// would make it use an API key, and minus a parent Claude Code session's
// variables (only present when the app is started from one, in development).
function cleanEnv(): Record<string, string | undefined> {
    const keep = /^(CLAUDE_CONFIG_DIR|CLAUDE_CODE_USE_(BEDROCK|VERTEX))$/;
    return Object.fromEntries(Object.entries(process.env).filter(([k]) => keep.test(k) || !/^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE)/.test(k)));
}

// The Claude Code program that ships with the SDK (a per-platform package).
// In the installed app it sits in app.asar.unpacked, because a program can't
// be started from inside the app's archive (electron-builder.yml unpacks it).
function claudeExecutable(): string | undefined {
    try {
        const pkg = require.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`);
        const exe = path.join(path.dirname(pkg), process.platform === "win32" ? "claude.exe" : "claude");
        return exe.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
    } catch {
        return undefined;   // let the SDK find it
    }
}

const CLAUDE_EXE = claudeExecutable();

// Events from Claude Code and from running tools, merged into one stream.
class Queue<T> {
    private items: T[] = [];
    private wake: (() => void) | null = null;
    private closed = false;
    push(item: T) { this.items.push(item); this.wake?.(); }
    close() { this.closed = true; this.wake?.(); }
    async *drain(idleMs: number, onIdle: () => T): AsyncGenerator<T> {
        for (;;) {
            while (this.items.length) yield this.items.shift()!;
            if (this.closed) return;
            const idle = await new Promise<boolean>((resolve) => {
                const timer = setTimeout(() => resolve(true), idleMs);
                this.wake = () => { clearTimeout(timer); resolve(false); };
            });
            this.wake = null;
            if (idle && !this.items.length && !this.closed) yield onIdle();
        }
    }
}

const textOf = (content: unknown): string =>
    typeof content === "string" ? content
        : Array.isArray(content) ? content.map((p: any) => (p?.type === "text" || p?.type === "input_text" || p?.type === "output_text" ? p.text ?? "" : "")).join("")
            : "";

// A chat title from its first message, without spending a model call on it.
function titleFrom(text: string): string {
    const line = text.replace(/\s+/g, " ").trim();
    if (line.length <= 48) return line || "New Chat";
    const cut = line.slice(0, 48);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 24))}…`;
}

export type ClaudeCodeDeps = {
    messageService: MessageService;
    usage?: UsageRepository;
    // An empty folder Claude Code runs in (it reads and writes nothing there).
    workDir: string;
};

export class ClaudeCodeProvider implements ILLM {
    constructor(private deps: ClaudeCodeDeps) {
        mkdirSync(deps.workDir, { recursive: true });
    }

    getProvider() { return "claude"; }
    getModel() { return "default"; }
    getModels() { return [...MODELS]; }
    supportsTools() { return true; }
    async chat(): Promise<never> { throw new Error("Use chatStream"); }
    async summarizeChat(): Promise<string> { return ""; }

    // The app's tools as an MCP server Claude Code calls back into.
    private toolServer(toolset: ToolSource, ctx: ToolContext) {
        // The tools are the agent's own, with their JSON schemas as they are,
        // so they're served by hand rather than registered one by one.
        const mcp = new McpServer({ name: MCP_NAME, version: "1.0.0" }, { capabilities: { tools: {} } });
        const server = mcp.server;
        server.setRequestHandler(ListToolsRequestSchema, async () => ({
            // Read-only tools (helper agents, document search…) are marked so Claude
            // Code may run several of them at the same time, like the server does.
            tools: toolset.getAll().map((t) => ({ name: t.name, description: t.description, inputSchema: t.parameters as any, ...(t.parallel ? { annotations: { readOnlyHint: true } } : {}) })),
        }));
        server.setRequestHandler(CallToolRequestSchema, async (req) => {
            try {
                const out = await toolset.executeTool(req.params.name, (req.params.arguments ?? {}) as Record<string, any>, ctx);
                return { content: [{ type: "text", text: typeof out === "string" ? out : JSON.stringify(out ?? null) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: "text", text: JSON.stringify({ error: true, message, hint: "Tool execution failed. Do not retry with the same arguments." }) }], isError: true };
            }
        });
        return mcp;
    }

    async *chatStream(messages: LLMMessage[], userId: string, sessionId: string, _apiKey: string, signal: AbortSignal, model?: string, run?: ChatRunOptions): AsyncGenerator<LLMMessage, unknown, void> {
        const { messageService } = this.deps;
        const db = await messageService.rawDb();
        const before = await messageService.loadMessages(sessionId);
        await messageService.runTransaction(sessionId, messages);
        const userText = messages.map((m) => textOf(m.content)).join("\n").trim();

        const { rows } = await db.query<{ source: string; title: string; remote_session_id: string | null }>(
            `SELECT source, title, remote_session_id FROM sessions WHERE id = $1`, [sessionId]);
        const session = rows[0];
        // Helper agents and workflow steps run in throwaway chats: nothing to resume.
        const keep = session?.source !== "pipeline";
        let resume = keep ? session?.remote_session_id ?? null : null;

        const events = new Queue<LLMMessage>();
        const emit: ToolContext["emit"] = (event) => events.push(event as unknown as LLMMessage);
        const abort = new AbortController();
        const onAbort = () => abort.abort();
        if (signal.aborted) abort.abort(); else signal.addEventListener("abort", onAbort, { once: true });
        const minutes = run?.limits?.maxMinutes;
        const deadline = minutes ? setTimeout(() => abort.abort(), minutes * 60_000) : null;

        const toolset = run?.tools;
        const toolNames = toolset?.getAll().map((t) => t.name) ?? [];
        const options: Options = {
            systemPrompt: run?.systemPrompt || BASE_PROMPT,
            ...(model && model !== "default" ? { model } : {}),
            tools: [],
            allowedTools: toolNames.map((n) => TOOL_PREFIX + n),
            ...(toolset && toolNames.length
                ? { mcpServers: { [MCP_NAME]: { type: "sdk", name: MCP_NAME, instance: this.toolServer(toolset, { db, userId, sessionId, kbScope: run?.kbScope, signal: abort.signal, emit }) as any } } }
                : {}),
            settingSources: [],
            includePartialMessages: true,
            maxTurns: run?.limits?.maxRounds ?? DEFAULT_MAX_TURNS,
            persistSession: keep,
            abortController: abort,
            cwd: this.deps.workDir,
            // App tools may wait on the user (a command's approval dialog,
            // then the command itself): don't let Claude Code give up early.
            env: { MCP_TOOL_TIMEOUT: String(75 * 60_000), ...cleanEnv() },
            ...(CLAUDE_EXE ? { pathToClaudeCodeExecutable: CLAUDE_EXE } : {}),
        };

        // What has been said so far, for a chat Claude Code no longer has.
        const replay = () => {
            const lines = before
                .filter((m) => m.role === "user" || m.role === "assistant")
                .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${textOf(m.content)}`)
                .filter((l) => l.length > 12);
            if (!lines.length) return userText;
            return `Earlier in this conversation:\n\n${lines.join("\n\n").slice(-REPLAY_CHARS)}\n\n---\nThe user's new message:\n\n${userText}`;
        };

        const calls = new Map<string, { name: string; args: Record<string, any> }>();
        let streamed = "";              // text of the assistant message being streamed
        let finalText = "";             // the last complete assistant text, saved with the usage
        let served: string | undefined;
        let ended = false;

        const save = (text: string, metadata: Record<string, unknown>) =>
            messageService.createLLMMessage(sessionId, { type: "message", role: "assistant", content: [{ type: "output_text", text }] as any, metadata } as LLMMessage);
        const meta = () => ({ provider: "claude", model: served ?? model ?? "default" });

        // Runs the turn in Claude Code and feeds `events`. Returns false if the
        // saved Claude Code session is gone and the turn should be retried.
        const turn = async (withResume: string | null): Promise<boolean> => {
            const { query } = await loadSdk();
            const q = query({ prompt: withResume || !before.length ? userText : replay(), options: { ...options, ...(withResume ? { resume: withResume } : {}) } });
            for await (const m of q as AsyncIterable<any>) {
                if (m.type === "system" && m.subtype === "init") {
                    served = m.model;
                    if (keep && m.session_id && m.session_id !== session?.remote_session_id) {
                        await db.query(`UPDATE sessions SET remote_session_id = $2 WHERE id = $1`, [sessionId, m.session_id]);
                    }
                } else if (m.type === "stream_event" && !m.parent_tool_use_id) {
                    const e = m.event;
                    if (e?.type === "content_block_start" && e.content_block?.type === "tool_use") {
                        const name = String(e.content_block.name).replace(TOOL_PREFIX, "");
                        events.push({ id: e.content_block.id, name, type: "function_call", tool_call_id: e.content_block.id } as LLMMessage);
                    } else if (e?.type === "content_block_delta" && e.delta?.type === "text_delta" && e.delta.text) {
                        streamed += e.delta.text;
                        events.push({ type: "message", role: "assistant", content: [{ type: "text", text: e.delta.text }] } as LLMMessage);
                    }
                } else if (m.type === "assistant" && !m.parent_tool_use_id) {
                    const blocks: any[] = m.message?.content ?? [];
                    const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
                    // Text before a tool call is saved as it is; the last text waits for the usage.
                    if (finalText) await save(finalText, meta());
                    finalText = text;
                    streamed = "";
                    for (const b of blocks.filter((b) => b.type === "tool_use")) {
                        const name = String(b.name).replace(TOOL_PREFIX, "");
                        calls.set(b.id, { name, args: b.input ?? {} });
                        events.push({ type: "function_call_arguments", tool_call_id: b.id, arguments: JSON.stringify(b.input ?? {}) } as unknown as LLMMessage);
                    }
                } else if (m.type === "user" && !m.parent_tool_use_id) {
                    const results: any[] = Array.isArray(m.message?.content) ? m.message.content.filter((b: any) => b.type === "tool_result") : [];
                    for (const r of results) {
                        const call = calls.get(r.tool_use_id);
                        const output = textOf(r.content) || (typeof r.content === "string" ? r.content : JSON.stringify(r.content ?? ""));
                        events.push({ type: "function_call_output", tool_call_id: r.tool_use_id, ...(r.is_error ? { error: output } : { output }) } as unknown as LLMMessage);
                        if (finalText) { await save(finalText, meta()); finalText = ""; }
                        await messageService.runTransaction(sessionId, [
                            { role: "tool_call", type: "tool_call", tool_call_id: r.tool_use_id, name: call?.name ?? "tool", arguments: call?.args ?? {} } as LLMMessage,
                            { role: "tool_call_output", type: "tool_call_output", tool_call_id: r.tool_use_id, output } as LLMMessage,
                        ]);
                    }
                } else if (m.type === "result") {
                    const failed = m.is_error || m.subtype !== "success";
                    // The saved session is gone (cleared, or another computer's data): start it afresh.
                    if (failed && withResume && !finalText && !calls.size && /no conversation found|session/i.test(String(m.result ?? m.subtype ?? ""))) return false;
                    const u = m.usage ?? {};
                    const usage = {
                        input_tokens: u.input_tokens ?? 0, output_tokens: u.output_tokens ?? 0,
                        cache_read_tokens: u.cache_read_input_tokens ?? 0, cache_write_tokens: u.cache_creation_input_tokens ?? 0,
                    };
                    const total = usage.input_tokens + usage.output_tokens + usage.cache_read_tokens + usage.cache_write_tokens;
                    const summary = { ...usage, total_tokens: total, requests: m.num_turns ?? 1, model: served ?? model ?? "default", provider: "claude", byok: false };
                    if (finalText) await save(finalText, { ...meta(), usage: summary });
                    finalText = "";
                    void this.deps.usage?.record({ userId, sessionId, kind: "chat", provider: "claude", model: summary.model, requests: summary.requests, ...usage } as any).catch(() => {});
                    events.push({ type: "usage", usage: summary } as unknown as LLMMessage);
                    if (m.subtype === "error_max_turns") {
                        events.push({ type: "error", code: "max_turns", message: "The agent used all its tool rounds before finishing. Raise its limit, or ask for a smaller task." } as LLMMessage);
                    } else if (failed) {
                        events.push({ type: "error", code: "error", message: explain(String(m.result ?? m.subtype ?? "The request failed")) } as LLMMessage);
                    }
                    ended = true;
                }
            }
            return true;
        };

        const work = (async () => {
            try {
                if (!(await turn(resume))) {
                    resume = null;
                    await db.query(`UPDATE sessions SET remote_session_id = NULL WHERE id = $1`, [sessionId]);
                    await turn(null);
                }
                if (session?.title === "New Chat" && keep && userText) {
                    const title = titleFrom(userText);
                    await messageService.updateTitle(sessionId, userId, title);
                    events.push({ type: "session_title", content: title } as LLMMessage);
                }
                if (!ended) events.push({ type: "error", code: "error", message: "Claude Code stopped without an answer. Please try again." } as LLMMessage);
            } catch (err: any) {
                // Stop (or the agent's time limit): keep what was already on screen.
                const partial = finalText || streamed;
                if (partial) await save(partial, meta()).catch(() => {});
                if (abort.signal.aborted) events.push({ type: "cancelled", content: [{ type: "aborted", text: "Request cancelled." }] } as unknown as LLMMessage);
                else events.push({ type: "error", code: "error", message: explain(err?.message ?? String(err)) } as LLMMessage);
            } finally {
                events.close();
            }
        })();

        try {
            for await (const event of events.drain(HEARTBEAT_MS, () => ({ type: "heartbeat" }) as unknown as LLMMessage)) yield event;
            await work;
            yield { content: "", isDone: true } as unknown as LLMMessage;
        } finally {
            if (deadline) clearTimeout(deadline);
            signal.removeEventListener("abort", onAbort);
            // The reader went away mid-answer: stop Claude Code too.
            if (!ended) abort.abort();
        }
        return undefined;
    }
}

// Claude Code's own errors, in words that tell the user what to do.
function explain(message: string): string {
    if (/invalid api key|please run \/login|not logged in|authentication|oauth/i.test(message)) {
        return "Claude Code isn't signed in on this computer. Open a terminal, run \"claude\" and sign in with your organisation's Claude account, then try again.";
    }
    if (/usage limit|rate limit|quota|overloaded/i.test(message)) {
        return `Your Claude plan's limit was reached, or Claude is busy: ${message}`;
    }
    if (/ENOENT|spawn|executable/i.test(message)) {
        return "Claude Code couldn't be started on this computer. Reinstall the app, or contact your administrator.";
    }
    return message;
}
