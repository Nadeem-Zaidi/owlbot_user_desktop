// The server edition runs Python (code functions, Word/Excel files) in a
// separate service. The desktop app has no such service.
export type RunPythonResult = { ok: boolean; result?: unknown; error?: string; stdout?: string; duration_ms?: number };

export async function runPython(_code: string, _args: Record<string, unknown>, _secrets: Record<string, string>, _timeoutMs?: number): Promise<RunPythonResult> {
    throw new Error("Code functions aren't available in the desktop app");
}
