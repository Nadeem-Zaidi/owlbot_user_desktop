// run_local_command: the request/approval handshake, and running commands.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { createLocalCommandTool, LocalCommandBroker } from "../../engine/core/local_commands/local_command_tool";
import { runLocalCommand, type LocalCommandRequest } from "../../engine/core/local_commands/run_command";

const req = (p: Partial<LocalCommandRequest>): LocalCommandRequest =>
    ({ requestId: "r", command: "echo hi", shell: "powershell", cwd: null, reason: "", timeoutMinutes: 1, ...p });

// The tool, with a stand-in for the desktop app: `answer` decides what the
// "user" does with each request the tool sends into the chat.
function setup(answer: (b: LocalCommandBroker, request: LocalCommandRequest) => void) {
    const broker = new LocalCommandBroker();
    const tool = createLocalCommandTool(broker);
    const events: any[] = [];
    const emit = (e: any) => { events.push(e); queueMicrotask(() => answer(broker, e.request)); };
    return { broker, tool, events, emit };
}

describe("run_local_command tool", () => {
    it("sends the request into the chat and returns the output once the app answers", async () => {
        const { tool, events, emit } = setup((b, r) => b.resolve(r.requestId, { status: "ran", exitCode: 0, stdout: "hello\n", stderr: "", timedOut: false, durationMs: 1200 }));
        const out = await tool.execute({ command: "echo hello", shell: "bash", reason: "Say hello", timeout_minutes: 3 }, { userId: "u", emit } as any);
        assert.equal(events.length, 1);
        assert.equal(events[0].type, "local_command_request");
        assert.deepEqual({ ...events[0].request, requestId: "x" }, { requestId: "x", command: "echo hello", shell: "bash", cwd: null, reason: "Say hello", timeoutMinutes: 3 });
        assert.deepEqual(out, { status: "ran", exit_code: 0, duration_seconds: 1.2, stdout: "hello\n" });
    });

    it("tells the model not to retry a denied command", async () => {
        const { tool, emit } = setup((b, r) => b.resolve(r.requestId, { status: "denied" }));
        const out: any = await tool.execute({ command: "rm -rf /", shell: "bash", reason: "x" }, { userId: "u", emit } as any);
        assert.equal(out.status, "denied");
        assert.match(out.note, /Don't run it again/);
    });

    it("only runs in a live chat", async () => {
        const tool = createLocalCommandTool(new LocalCommandBroker());
        await assert.rejects(tool.execute({ command: "dir", shell: "cmd", reason: "x" }, { userId: "u" } as any), /live chat/);
    });

    it("stops waiting when the user presses Stop", async () => {
        const { tool, emit } = setup(() => {});
        const abort = new AbortController();
        const pending = tool.execute({ command: "dir", shell: "cmd", reason: "x" }, { userId: "u", emit, signal: abort.signal } as any);
        abort.abort();
        const out: any = await pending;
        assert.equal(out.status, "not_run");
    });

    it("takes the first answer only, and only from the same user", async () => {
        let id = "";
        const { broker, tool, emit } = setup((_b, r) => { id = r.requestId; });
        const pending = tool.execute({ command: "dir", shell: "cmd", reason: "x" }, { userId: "u", emit } as any);
        await new Promise((r) => setTimeout(r, 0));
        assert.ok(broker.get(id), "the app can read the pending request");
        assert.equal(broker.resolve(id, { status: "denied" }, "someone-else"), false);
        assert.equal(broker.resolve(id, { status: "denied" }, "u"), true);
        assert.equal(broker.resolve(id, { status: "unavailable", message: "late" }), false);
        assert.equal(broker.get(id), null);
        assert.equal(((await pending) as any).status, "denied");
    });
});

describe("running a command", { skip: process.platform !== "win32" && "Windows shells" }, () => {
    it("runs PowerShell with UTF-8 output and the exit code", async () => {
        const r = await runLocalCommand(req({ command: "Write-Output 'café ✓'; exit 3" }));
        assert.equal(r.status, "ran");
        if (r.status !== "ran") return;
        assert.equal(r.stdout.trim(), "café ✓");
        assert.equal(r.exitCode, 3);
    });

    it("runs cmd and Git Bash, in the home folder by default", async () => {
        const c = await runLocalCommand(req({ shell: "cmd", command: "cd" }));
        assert.ok(c.status === "ran" && c.stdout.trim().toLowerCase() === os.homedir().toLowerCase(), JSON.stringify(c));
        const b = await runLocalCommand(req({ shell: "bash", command: "echo $((6*7)) && echo oops >&2" }));
        assert.ok(b.status === "ran" && b.stdout.trim() === "42" && b.stderr.trim() === "oops", JSON.stringify(b));
    });

    it("refuses a folder that doesn't exist", async () => {
        const r = await runLocalCommand(req({ cwd: "C:\\no\\such\\folder" }));
        assert.equal(r.status, "unavailable");
    });

    it("stops a command at the time limit, with what it printed so far", async () => {
        const abort = new AbortController();
        setTimeout(() => abort.abort(), 1500);
        const started = Date.now();
        const r = await runLocalCommand(req({ command: "Write-Output started; Start-Sleep -Seconds 30" }), abort.signal);
        assert.ok(Date.now() - started < 10_000, "killed well before 30 s");
        assert.ok(r.status === "ran" && r.stdout.includes("started"), JSON.stringify(r));
    });
});
