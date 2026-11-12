import { randomUUID } from "node:crypto";
import { ToolContext, ToolDefinition } from "../../types/type";
import { LocalCommandRequest, LocalCommandResult, Shell } from "./run_command";

// run_local_command: an agent asks to run a shell command on this computer.
//
//   1. The tool sends a "local_command_request" event into the live chat.
//   2. The desktop app shows its own approval dialog (Electron, outside the
//      page) with the exact command. Nothing runs unless the user clicks Run.
//   3. The app runs it and answers here (resolve); the agent gets the output.
//
// Only offered in the user's live desktop chat (never in schedules,
// workflows or helper runs), and only for agents where it is ticked.

export const LOCAL_COMMAND_TOOL = "run_local_command";

const SHELLS: Shell[] = ["powershell", "cmd", "bash"];
// How long to wait for the user to answer the dialog.
const APPROVAL_WAIT_MS = 10 * 60_000;
const OUTPUT_TO_MODEL = 20_000;

type Pending = { request: LocalCommandRequest; userId: string; resolve: (r: LocalCommandResult) => void };

export class LocalCommandBroker {
    private pending = new Map<string, Pending>();

    // The request as the engine made it (the dialog shows and runs this, not
    // what the page sends), while the agent is still waiting for it.
    get(requestId: string): LocalCommandRequest | null {
        return this.pending.get(requestId)?.request ?? null;
    }

    // First answer wins; later ones (a retry, the page after the app) are ignored.
    resolve(requestId: string, result: LocalCommandResult, userId?: string): boolean {
        const p = this.pending.get(requestId);
        if (!p || (userId && p.userId !== userId)) return false;
        this.pending.delete(requestId);
        p.resolve(result);
        return true;
    }

    ask(request: LocalCommandRequest, userId: string, emit: NonNullable<ToolContext["emit"]>, signal?: AbortSignal): Promise<LocalCommandResult> {
        return new Promise((resolve) => {
            const wait = APPROVAL_WAIT_MS + request.timeoutMinutes * 60_000;
            const end = (r: LocalCommandResult) => {
                clearTimeout(timer);
                signal?.removeEventListener("abort", onAbort);
                resolve(r);
            };
            const timer = setTimeout(() => this.resolve(request.requestId, { status: "unavailable", message: "No answer from the user in time." }), wait);
            const onAbort = () => this.resolve(request.requestId, { status: "unavailable", message: "The user stopped the answer." });
            this.pending.set(request.requestId, { request, userId, resolve: end });
            signal?.addEventListener("abort", onAbort, { once: true });
            emit({ type: "local_command_request", request });
        });
    }
}

const tail = (s: string) => (s.length > OUTPUT_TO_MODEL ? `…(${s.length - OUTPUT_TO_MODEL} earlier characters cut)\n${s.slice(-OUTPUT_TO_MODEL)}` : s);

export function createLocalCommandTool(broker: LocalCommandBroker): ToolDefinition {
    return {
        name: LOCAL_COMMAND_TOOL,
        description:
            "Runs ONE shell command on the user's own computer. The user sees the exact command and must approve it first, so: one clear step per call, " +
            "explain why in `reason`, never hide what a command does, and prefer read-only commands when you only need information. " +
            "Returns the exit code and output, or that the user denied it — if denied, don't retry the same command; ask the user what they want instead.",
        parameters: {
            type: "object",
            properties: {
                command: { type: "string", description: "The command line to run" },
                shell: { type: "string", enum: SHELLS, description: "powershell (Windows default), cmd, or bash (Git Bash on Windows)" },
                reason: { type: "string", description: "One sentence for the user: what this does and why" },
                cwd: { type: "string", description: "Folder to run in (optional; default: the user's home folder). ~ means the home folder." },
                timeout_minutes: { type: "integer", description: "Stop it after this many minutes (1–60, default 5)" },
            },
            required: ["command", "shell", "reason"],
        },
        execute: async (args, ctx) => {
            if (!ctx.emit || !ctx.userId) throw new Error("Commands can only run in a live chat in the Owl desktop app.");
            const command = String(args.command ?? "").trim();
            if (!command) throw new Error("Give the command to run.");
            if (command.length > 8000) throw new Error("The command is too long (8,000 characters at most). Put long scripts in a file first.");
            const shell = SHELLS.includes(args.shell) ? (args.shell as Shell) : "powershell";
            const request: LocalCommandRequest = {
                requestId: randomUUID(),
                command,
                shell,
                cwd: typeof args.cwd === "string" && args.cwd.trim() ? args.cwd.trim() : null,
                reason: String(args.reason ?? "").trim().slice(0, 300),
                timeoutMinutes: Math.max(1, Math.min(60, Math.round(Number(args.timeout_minutes) || 5))),
            };
            const r = await broker.ask(request, ctx.userId, ctx.emit, ctx.signal);
            if (r.status === "denied") return { status: "denied", note: "The user denied this command. Don't run it again; ask what they'd like instead." };
            if (r.status === "unavailable") return { status: "not_run", reason: r.message };
            return {
                status: r.timedOut ? "timed_out" : "ran",
                exit_code: r.exitCode,
                duration_seconds: Math.round(r.durationMs / 100) / 10,
                stdout: tail(r.stdout),
                ...(r.stderr.trim() ? { stderr: tail(r.stderr) } : {}),
            };
        },
    };
}
