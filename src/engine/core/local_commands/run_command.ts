import { spawn, spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Runs one approved command on this computer and collects its output.
// Only called after the user clicked "Run" in the desktop app's dialog.

export type Shell = "powershell" | "cmd" | "bash";

export type LocalCommandRequest = {
    requestId: string;
    command: string;
    shell: Shell;
    cwd: string | null;
    reason: string;
    timeoutMinutes: number;
};

export type LocalCommandResult =
    | { status: "ran"; exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; durationMs: number }
    | { status: "denied" }
    | { status: "unavailable"; message: string };

const MAX_OUTPUT_CHARS = 1_000_000;

// Git Bash on Windows. Not "bash" from PATH first: C:\Windows\System32\bash.exe
// is WSL, a different Linux system with different files.
function bashPath(): string | null {
    if (process.platform !== "win32") return "/bin/bash";
    const roots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs")].filter(Boolean) as string[];
    for (const root of roots) {
        const p = path.join(root, "Git", "bin", "bash.exe");
        if (existsSync(p)) return p;
    }
    const where = spawnSync("where", ["bash"], { encoding: "utf-8", windowsHide: true });
    const found = (where.stdout ?? "").split(/\r?\n/).map((s) => s.trim()).find((p) => p && !/\\windows\\system32\\/i.test(p));
    return found ?? null;
}

function shellCommand(shell: Shell, command: string): { file: string; args: string[]; verbatim?: boolean } | string {
    if (shell === "powershell") {
        const exe = process.platform === "win32" ? "powershell.exe" : "pwsh";
        // UTF-8 output, so non-English text isn't garbled.
        return { file: exe, args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", `[Console]::OutputEncoding = [Text.Encoding]::UTF8; ${command}`] };
    }
    if (shell === "cmd") {
        if (process.platform !== "win32") return "cmd is only available on Windows.";
        return { file: "cmd.exe", args: ["/d", "/s", "/c", `"chcp 65001 >nul & ${command}"`], verbatim: true };
    }
    const bash = bashPath();
    if (!bash) return "Bash isn't installed. Install Git for Windows (it includes Git Bash), or use PowerShell.";
    return { file: bash, args: ["-c", command] };
}

function resolveCwd(cwd: string | null): string | { error: string } {
    if (!cwd) return os.homedir();
    const expanded = cwd.replace(/^~(?=$|[\\/])/, os.homedir());
    try {
        if (statSync(expanded).isDirectory()) return expanded;
    } catch { /* missing */ }
    return { error: `The folder "${cwd}" doesn't exist.` };
}

// Ends the process and everything it started (on Windows, child.kill() would
// leave the command's own children running).
function killTree(pid: number | undefined) {
    if (!pid) return;
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true }).on("error", () => {});
    else try { process.kill(-pid, "SIGKILL"); } catch { try { process.kill(pid, "SIGKILL"); } catch { /* gone */ } }
}

export function runLocalCommand(request: LocalCommandRequest, signal?: AbortSignal): Promise<LocalCommandResult> {
    const how = shellCommand(request.shell, request.command);
    if (typeof how === "string") return Promise.resolve({ status: "unavailable", message: how });
    const cwd = resolveCwd(request.cwd);
    if (typeof cwd !== "string") return Promise.resolve({ status: "unavailable", message: cwd.error });

    return new Promise((resolve) => {
        const started = Date.now();
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let done = false;
        const child = spawn(how.file, how.args, {
            cwd,
            windowsHide: true,
            windowsVerbatimArguments: how.verbatim,
            detached: process.platform !== "win32",
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, PYTHONIOENCODING: "utf-8" },
        });
        const add = (which: "out" | "err", chunk: Buffer) => {
            const text = chunk.toString("utf-8");
            if (which === "out") stdout = (stdout + text).slice(-MAX_OUTPUT_CHARS);
            else stderr = (stderr + text).slice(-MAX_OUTPUT_CHARS);
        };
        child.stdout.on("data", (c: Buffer) => add("out", c));
        child.stderr.on("data", (c: Buffer) => add("err", c));

        const limit = Math.max(1, Math.min(60, request.timeoutMinutes || 5)) * 60_000;
        const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, limit);
        const onAbort = () => killTree(child.pid);
        signal?.addEventListener("abort", onAbort, { once: true });

        const finish = (result: LocalCommandResult) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            resolve(result);
        };
        child.on("error", (err) => finish({ status: "unavailable", message: `Couldn't start ${request.shell}: ${err.message}` }));
        child.on("close", (code) => finish({ status: "ran", exitCode: code, stdout, stderr, timedOut, durationMs: Date.now() - started }));
    });
}
