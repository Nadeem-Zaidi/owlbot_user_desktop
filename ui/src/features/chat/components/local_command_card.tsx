import { CircleCheck, CircleX, LoaderCircle, OctagonX, TerminalSquare } from "lucide-react";
import type { LocalCommandRequest, LocalCommandResult } from "@/shared/lib/desktop";

export type LocalCommandItem = { request: LocalCommandRequest; result?: LocalCommandResult };

const seconds = (ms: number) => (ms < 1000 ? "<1s" : `${Math.round(ms / 1000)}s`);

// A command the agent asked to run on this computer: waiting for the desktop
// app's approval dialog, then what happened.
export const LocalCommandCard = ({ item }: { item: LocalCommandItem }) => {
  const { request, result } = item;
  const failed = result?.status === "ran" && (result.timedOut || (result.exitCode ?? 1) !== 0);
  const icon = !result
    ? <LoaderCircle size={16} className="lc_spin" />
    : result.status === "ran"
      ? (failed ? <CircleX size={16} /> : <CircleCheck size={16} />)
      : result.status === "denied" ? <OctagonX size={16} /> : <TerminalSquare size={16} />;
  const status = !result
    ? "Waiting for your approval in the Owl dialog…"
    : result.status === "ran"
      ? `${result.timedOut ? "Stopped at the time limit" : `Exit code ${result.exitCode ?? "–"}`} · ${seconds(result.durationMs)}`
      : result.status === "denied" ? "You denied this command" : `Not run — ${result.message}`;
  const output = result?.status === "ran" ? [result.stdout.trim(), result.stderr.trim() && `--- errors ---\n${result.stderr.trim()}`].filter(Boolean).join("\n") : "";

  return (
    <div className={`br_approval lc_card ${result ? "is_done" : ""} ${failed ? "is_failed" : ""}`} role="group" aria-label="Command on this computer">
      <span className="br_approval__icon">{icon}</span>
      <div className="br_approval__body">
        <strong>{request.reason || "Command on this computer"}</strong>
        <code className="lc_command">{request.command}</code>
        <span className="ag_muted ag_small">{request.shell}{request.cwd ? ` · ${request.cwd}` : ""} · {status}</span>
        {output && (
          <details className="lc_output">
            <summary>Output</summary>
            <pre>{output.length > 20_000 ? `${output.slice(0, 2_000)}\n…\n${output.slice(-18_000)}` : output}</pre>
          </details>
        )}
      </div>
    </div>
  );
};
