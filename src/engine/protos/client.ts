import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Code functions run with the Python installed on this computer: one fresh
// process per call, started in an empty temporary folder that is deleted
// afterwards. The code, arguments and secrets go in on stdin (never on the
// command line, where other programs could see them).
//
// Which Python: OWL_PYTHON if set (a full path to python.exe), otherwise the
// first of `py -3`, `python`, `python3` that reports Python 3.

export type RunPythonResult = { ok: boolean; result?: unknown; error?: string; stdout?: string; duration_ms?: number };

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const MARKER = "__OWL_RESULT__";

// Runs inside Python: loads the user's code, calls run(args, secrets) with
// print() captured, and writes the outcome as one JSON line after MARKER.
const RUNNER = String.raw`
import sys, io, json, traceback, inspect, asyncio, contextlib
real_out = sys.stdout
payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
buf = io.StringIO()
out = {"ok": False}
try:
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
        ns = {"__name__": "owl_function"}
        exec(compile(payload["code"], "<function>", "exec"), ns)
        fn = ns.get("run")
        if not callable(fn):
            raise RuntimeError("The code must define a function: def run(args, secrets):")
        result = fn(payload["args"], payload["secrets"])
        if inspect.isawaitable(result):
            async def _wait(a):
                return await a
            result = asyncio.run(_wait(result))
    out = {"ok": True, "result": result}
except BaseException as e:
    frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == "<function>"]
    where = f" (line {frames[-1].lineno})" if frames else ""
    if isinstance(e, SyntaxError):
        where = ""
    detail = "".join(traceback.format_list(frames)) if frames else ""
    out = {"ok": False, "error": f"{type(e).__name__}: {e}{where}" + (f"\n{detail}" if detail else "")}
out["stdout"] = buf.getvalue()
try:
    line = json.dumps(out, default=str, allow_nan=False)
except (ValueError, TypeError):
    out["result"] = repr(out.get("result"))
    line = json.dumps(out, default=str)
real_out.write("\n${MARKER}" + line + "\n")
real_out.flush()
`;

type Interpreter = { cmd: string; args: string[] };
let interpreter: Interpreter | null | undefined;

function findPython(): Interpreter | null {
    if (interpreter !== undefined) return interpreter;
    const candidates: Interpreter[] = process.env.OWL_PYTHON
        ? [{ cmd: process.env.OWL_PYTHON, args: [] }]
        : process.platform === "win32"
            ? [{ cmd: "py", args: ["-3"] }, { cmd: "python", args: [] }, { cmd: "python3", args: [] }]
            : [{ cmd: "python3", args: [] }, { cmd: "python", args: [] }];
    for (const c of candidates) {
        // Windows' "python" can be the Microsoft Store placeholder, which
        // prints nothing useful — so the version is checked, not just the exit code.
        // The interpreter's own path is used from then on: stopping the `py`
        // launcher on a timeout wouldn't reliably stop the Python it started.
        const r = spawnSync(c.cmd, [...c.args, "-c", "import sys; print(sys.version_info[0], sys.executable)"], { encoding: "utf-8", windowsHide: true, timeout: 10_000 });
        const m = !r.error && r.status === 0 ? /^3 (.+)$/m.exec(r.stdout.trim()) : null;
        if (m) return (interpreter = { cmd: m[1].trim(), args: [] });
    }
    // Not cached: the user may install Python while the app is open.
    return null;
}

export async function runPython(code: string, args: Record<string, unknown>, secrets: Record<string, string>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<RunPythonResult> {
    const py = findPython();
    if (!py) {
        throw new Error("Python 3 wasn't found on this computer. Install it from python.org (tick \"Add python.exe to PATH\"), or set OWL_PYTHON to the full path of python.exe, then try again.");
    }

    const workDir = await mkdtemp(path.join(os.tmpdir(), "owl-py-"));
    const started = Date.now();
    try {
        return await new Promise<RunPythonResult>((resolve, reject) => {
            const child = spawn(py.cmd, [...py.args, "-u", "-c", RUNNER], {
                cwd: workDir,
                windowsHide: true,
                env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", PYTHONDONTWRITEBYTECODE: "1" },
            });
            let stdout = "";
            let stderr = "";
            let size = 0;
            let ended: string | null = null;
            const stop = (why: string) => {
                if (ended) return;
                ended = why;
                child.kill();
            };
            const timer = setTimeout(() => stop(`Timed out after ${+(timeoutMs / 1000).toFixed(1)}s`), timeoutMs);

            child.stdout.setEncoding("utf-8").on("data", (chunk: string) => {
                size += Buffer.byteLength(chunk);
                if (size > MAX_OUTPUT_BYTES) return stop("The function printed or returned more than 5 MB");
                stdout += chunk;
            });
            child.stderr.setEncoding("utf-8").on("data", (chunk: string) => {
                if (stderr.length < 20_000) stderr += chunk;
            });
            child.on("error", (err) => {
                clearTimeout(timer);
                reject(new Error(`Couldn't start Python: ${err.message}`));
            });
            child.on("close", (exitCode) => {
                clearTimeout(timer);
                const duration_ms = Date.now() - started;
                const at = stdout.lastIndexOf(MARKER);
                if (ended || at < 0) {
                    // Output the code wrote straight to the process (not via
                    // print) is all there is to show.
                    const printed = (at < 0 ? stdout : stdout.slice(0, at)).trim();
                    const error = ended ?? (stderr.trim().split("\n").slice(-15).join("\n") || `Python exited with code ${exitCode}`);
                    return resolve({ ok: false, error, stdout: printed, duration_ms });
                }
                try {
                    const out = JSON.parse(stdout.slice(at + MARKER.length).trim()) as RunPythonResult;
                    const outside = stdout.slice(0, at).trim();
                    const printed = [outside, out.stdout ?? ""].filter(Boolean).join("\n");
                    resolve({ ...out, stdout: printed, duration_ms });
                } catch {
                    resolve({ ok: false, error: "Couldn't read the function's result", stdout: stdout.slice(0, at), duration_ms });
                }
            });

            child.stdin.on("error", () => { /* the process ended early; close() reports it */ });
            child.stdin.end(JSON.stringify({ code, args, secrets }), "utf-8");
        });
    } finally {
        await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
}
