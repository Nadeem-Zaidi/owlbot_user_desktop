import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Copy, MessageSquare, Play, Square, Zap } from "lucide-react";
import { api, type StreamChunk } from "@/features/chat/api/chat_api";
import { BotMessage } from "@/features/chat/components/bot_message";
import { ToolCallCard } from "@/features/chat/components/tool_call_card";
import { CodeInterpreterCard } from "@/features/chat/components/code_interpreter_card";
import { loadSessions } from "@/features/chat/state/session_slice";
import { useAppDispatch } from "@/app/store";
import { formatTokens } from "@/features/insights/api/insights_api";
import type { CodeInterpreterFileRef, MessageUsage } from "@/shared/types";
import { Button, ErrorNote, Modal } from "@/shared/ui/ui";
import { BrowserApprovalCard, BrowserScreenshot, type BrowserApproval, type BrowserApprovalRequest } from "@/features/native_agents/components/browser_approval";

// What to run: a regular agent or a provider agent (Claude / OpenAI).
export type RunTarget = {
  kind: "agent" | "native";
  id: string;
  name: string;
  subtitle: string;
  placeholder?: string;
};

type Tool =
  | { kind: "function"; id: string; name: string; args: string; result?: string; done: boolean }
  | { kind: "code"; id: string; code: string; status: string; done: boolean; files: CodeInterpreterFileRef[] };

type Phase = "idle" | "running" | "done";

// Runs an agent once and shows its answer without leaving the page. Uses the
// normal chat stream, so the run is saved as a chat you can open afterwards.
export const RunDialog = ({ target, onClose }: { target: RunTarget; onClose: () => void }) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [output, setOutput] = useState("");
  const [tools, setTools] = useState<Tool[]>([]);
  const [usage, setUsage] = useState<MessageUsage | null>(null);
  const [approvals, setApprovals] = useState<BrowserApproval[]>([]);
  const [shot, setShot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  // The run's own chat — Stop cancels only this run, never other chats' replies.
  const runSessionRef = useRef<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const patchTool = (id: string | undefined, patch: (t: Tool) => Tool) =>
    setTools((list) => list.map((t) => (t.id === id ? patch(t) : t)));

  const onChunk = (chunk: StreamChunk) => {
    switch (chunk.type) {
      case "message":
        for (const c of chunk.content ?? []) if (c.type === "text" || c.type === "output_text") setOutput((o) => o + c.text);
        break;
      case "function_call":
        if (chunk.tool_call_id) setTools((t) => [...t, { kind: "function", id: chunk.tool_call_id!, name: chunk.name ?? "tool", args: "", done: false }]);
        break;
      case "function_call_arguments": // what the backend sends
      case "function_call_args":
        patchTool(chunk.tool_call_id, (t) => (t.kind === "function" ? { ...t, args: chunk.arguments ?? chunk.args ?? "" } : t));
        break;
      case "function_call_output":
        patchTool(chunk.tool_call_id, (t) => (t.kind === "function" ? { ...t, result: chunk.output ?? "", done: true } : t));
        break;
      // OpenAI code interpreter (regular ChatGPT agents): code + generated files
      case "code_interpreter_call":
        if (chunk.tool_call_id) setTools((t) => [...t, { kind: "code", id: chunk.tool_call_id!, code: "", status: "in_progress", done: false, files: [] }]);
        break;
      case "code_interpreter_call_code_delta":
        patchTool(chunk.tool_call_id, (t) => (t.kind === "code" ? { ...t, code: t.code + (chunk.delta ?? "") } : t));
        break;
      case "code_interpreter_call_code_done":
        patchTool(chunk.tool_call_id, (t) => (t.kind === "code" ? { ...t, code: chunk.code ?? t.code } : t));
        break;
      case "code_interpreter_call_status":
        patchTool(chunk.tool_call_id, (t) => (t.kind === "code" ? { ...t, status: chunk.status ?? t.status, done: chunk.status === "completed" || chunk.status === "failed" } : t));
        break;
      case "code_interpreter_file":
        // Files aren't tied to a call id; attach them to the latest code run.
        if (chunk.file_id && chunk.container_id) {
          const file: CodeInterpreterFileRef = { file_id: chunk.file_id, container_id: chunk.container_id, filename: chunk.filename } as CodeInterpreterFileRef;
          setTools((list) => {
            const last = [...list].reverse().find((t) => t.kind === "code");
            return last ? list.map((t) => (t === last && t.kind === "code" ? { ...t, files: [...t.files, file] } : t)) : list;
          });
        }
        break;
      case "approval_request":
        if (chunk.request) setApprovals((a) => [...a, { request: chunk.request as BrowserApprovalRequest }]);
        break;
      case "approval_resolved":
        setApprovals((a) => a.map((x) => (x.request.requestId === chunk.request_id ? { ...x, outcome: chunk.outcome } : x)));
        break;
      case "browser_screenshot":
        if (chunk.image) setShot(chunk.image);
        break;
      case "usage":
        if (chunk.usage) setUsage(chunk.usage);
        break;
      case "error":
        setError(chunk.message ?? "Something went wrong");
        break;
    }
    if (chunk.isDone || chunk.type === "error" || chunk.type === "cancelled") {
      setTools((list) => list.map((t) => (t.kind === "code" ? { ...t, done: true } : t)));
      setPhase("done");
    }
  };

  const run = async () => {
    const text = prompt.trim();
    if (!text || phase === "running") return;
    setPhase("running");
    setOutput("");
    setTools([]);
    setUsage(null);
    setApprovals([]);
    setShot(null);
    setError(null);
    setElapsed(0);
    startedAt.current = Date.now();
    try {
      const session = await api.newSession();
      runSessionRef.current = session.id;
      setSessionId(session.id);
      const message = { type: "message", role: "user" as const, content: [{ type: "text" as const, text }] };
      if (target.kind === "native") await api.sendMessage(session.id, message, onChunk, undefined, undefined, target.id);
      else await api.sendMessage(session.id, message, onChunk, undefined, target.id);
      dispatch(loadSessions()); // the run shows up in Recents
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the run");
    } finally {
      setElapsed(Math.round((Date.now() - startedAt.current) / 1000));
      setPhase("done");
    }
  };

  const stop = () => {
    if (runSessionRef.current) void api.abortChat(runSessionRef.current);
    setPhase("done");
  };

  const copy = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const close = () => {
    if (phase === "running" && runSessionRef.current) void api.abortChat(runSessionRef.current);
    onClose();
  };

  return (
    <Modal
      wide
      title={`Run · ${target.name}`}
      subtitle={target.subtitle}
      onClose={close}
      footer={
        <>
          {sessionId && phase === "done" && (
            <Button variant="ghost" onClick={() => navigate(`/chathome?session=${sessionId}`)}><MessageSquare size={14} /> Open as chat</Button>
          )}
          {phase === "running"
            ? <Button variant="secondary" onClick={stop}><Square size={13} /> Stop</Button>
            : <Button variant="primary" disabled={!prompt.trim()} onClick={run}><Play size={14} /> {phase === "done" ? "Run again" : "Run"}</Button>}
        </>
      }
    >
      <div className="na_run">
        <label className="ag_field">
          <span className="ag_field__label">Task</span>
          <textarea
            className="ag_input"
            rows={4}
            autoFocus
            value={prompt}
            disabled={phase === "running"}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void run(); } }}
            placeholder={target.placeholder ?? "What should the agent do?"}
          />
          <span className="ag_field__hint">Ctrl + Enter to run</span>
        </label>

        {phase !== "idle" && (
          <section className="na_run__result" aria-live="polite">
            <div className="na_run__bar">
              <span className="ag_field__label">Output</span>
              <span className="ag_muted ag_small">
                {phase === "running" ? `Running… ${elapsed}s` : `${elapsed}s`}
                {usage && <> · <Zap size={11} /> {formatTokens(usage.total_tokens)} tokens</>}
              </span>
              {output && phase === "done" && (
                <button type="button" className="ag_icon_btn" aria-label="Copy output" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
              )}
            </div>

            {tools.length > 0 && (
              <div className="na_run__tools">
                {tools.map((t) => t.kind === "code"
                  ? <CodeInterpreterCard key={t.id} code={t.code} status={t.status} done={t.done} files={t.files} />
                  : <ToolCallCard key={t.id} name={t.name} args={t.args} result={t.result} done={t.done} source="function" />)}
              </div>
            )}

            {shot && <BrowserScreenshot image={shot} />}
            {approvals.map((a) => <BrowserApprovalCard key={a.request.requestId} approval={a} />)}

            {output
              ? <div className="na_run__output"><BotMessage text={output} isStreaming={phase === "running"} /></div>
              : phase === "running" && <p className="ag_muted ag_small">Working on it…</p>}

            <ErrorNote message={error} />
            {phase === "done" && !output && !error && <p className="ag_muted ag_small">The agent finished without a text answer.</p>}
          </section>
        )}
      </div>
    </Modal>
  );
};
