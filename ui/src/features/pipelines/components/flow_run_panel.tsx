import { useState } from "react";
import { Check, CheckCircle2, ChevronDown, Copy, LoaderCircle, MinusCircle, PauseCircle, Play, Square, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import { Button } from "@/shared/ui/ui";
import { AgentAvatar } from "@/shared/ui/agent_avatar";
import type { FlowTraceEntry, PipelineRun } from "@/features/pipelines/api/pipelines_api";
import { branchClass, branchLabel } from "@/features/pipelines/lib/flow_graph";
import { MarkdownOutput } from "@/features/chat/components/markdown_output";

const STATUS_TEXT: Record<PipelineRun["status"], string> = {
  running: "Running", waiting: "Waiting for approval", succeeded: "Succeeded", failed: "Failed", rejected: "Rejected", cancelled: "Cancelled",
};

const Icon = ({ status }: { status: FlowTraceEntry["status"] }) => {
  switch (status) {
    case "running": return <LoaderCircle size={16} className="spin pl_st--running" />;
    case "succeeded": return <CheckCircle2 size={16} className="pl_st--ok" />;
    case "waiting": return <PauseCircle size={16} className="wf_st--wait" />;
    case "skipped": return <MinusCircle size={16} className="pl_st--skip" />;
    default: return <XCircle size={16} className="pl_st--bad" />;
  }
};

const fmtTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

type Props = {
  canRun: boolean;
  blockedReason?: string;
  starting: boolean;
  onRun: (input: string) => void;
  // When saving is what blocks the run: a save button right here.
  save?: { label: string; onSave: () => void; busy: boolean; disabled?: boolean; hint?: string };
  active: PipelineRun | null;
  runs: PipelineRun[];
  onPick: (run: PipelineRun) => void;
  onDecide: (approved: boolean, comment: string) => Promise<void>;
  onCancel: () => void;
};

// Workflow editor → right panel when no step is selected.
export const FlowRunPanel = ({ canRun, blockedReason, starting, onRun, save, active, runs, onPick, onDecide, onCancel }: Props) => {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [deciding, setDeciding] = useState<"approve" | "reject" | null>(null);
  const [copied, setCopied] = useState(false);
  const trace = (active?.steps ?? []) as unknown as FlowTraceEntry[];
  const waitingAt = active?.status === "waiting" ? [...trace].reverse().find((t) => t.status === "waiting") : undefined;
  const live = active?.status === "running" || active?.status === "waiting";

  const decide = async (approved: boolean) => {
    setDeciding(approved ? "approve" : "reject");
    try {
      await onDecide(approved, comment);
      setComment("");
    } finally {
      setDeciding(null);
    }
  };

  return (
    <div className="wf_run">
      <section className="ag_section">
        <h2 className="ag_section__title">Run</h2>
        <textarea className="ag_input" rows={3} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Input — e.g. paste an invoice, a topic, a question" />
        <Button variant="primary" onClick={() => onRun(input)} busy={starting} disabled={!canRun} title={blockedReason}>
          <Play size={15} /> Run workflow
        </Button>
        {blockedReason && !save && <span className="ag_muted ag_small">{blockedReason}</span>}
        {blockedReason && save && (
          <div className="wf_runsave">
            <span className="ag_muted ag_small">{save.hint ?? blockedReason}</span>
            <Button onClick={save.onSave} busy={save.busy} disabled={save.disabled}>{save.label}</Button>
          </div>
        )}
      </section>

      {active && (
        <section className="ag_section">
          <div className="ag_section__head">
            <h2 className="ag_section__title">Run #{active.id}</h2>
            <span className={`ag_status ag_status--${active.status}`}>{STATUS_TEXT[active.status]}</span>
          </div>
          {active.input && <p className="ag_muted ag_small">Input: “{active.input.slice(0, 160)}{active.input.length > 160 ? "…" : ""}”</p>}

          {waitingAt && (
            <div className="wf_approval" role="group" aria-label="Approval">
              <strong><PauseCircle size={15} /> {waitingAt.label}</strong>
              <pre className="wf_approval__msg">{waitingAt.output}</pre>
              <input className="ag_input" value={comment} maxLength={500} placeholder="Comment (optional)" onChange={(e) => setComment(e.target.value)} />
              <div className="wf_approval__actions">
                <Button variant="primary" busy={deciding === "approve"} disabled={!!deciding} onClick={() => void decide(true)}><ThumbsUp size={14} /> Approve</Button>
                <Button variant="danger" busy={deciding === "reject"} disabled={!!deciding} onClick={() => void decide(false)}><ThumbsDown size={14} /> Reject</Button>
              </div>
            </div>
          )}

          <ol className="pl_timeline">
            {trace.map((s, i) => (
              <li key={i} className={`pl_tl pl_tl--${s.status}`}>
                <button type="button" className="pl_tl__head" onClick={() => setOpen(open === i ? null : i)} disabled={!s.output && !s.error && !s.branches}>
                  <Icon status={s.status} />
                  <span className="pl_tl__agent">{s.agent_icon && <AgentAvatar icon={s.agent_icon} />} {s.label}</span>
                  {s.branch && <span className={`wf_branch wf_branch--${branchClass(s.branch)}`}>{s.branch_label ?? branchLabel(s.branch)}</span>}
                  {s.branches && s.status === "running" && (
                    <span className="ag_muted ag_small">{s.branches.filter((b) => b.status !== "running").length}/{s.branches.length} done</span>
                  )}
                  {(s.output || s.error || s.branches) && <ChevronDown size={14} className={open === i ? "ag_rot" : ""} />}
                </button>
                {open === i && (
                  <div className="pl_tl__body">
                    {s.error && <div className="ag_error">{s.error}</div>}
                    {s.decided_by && <p className="ag_muted ag_small">{s.status === "rejected" ? "Rejected" : "Approved"} by {s.decided_by}{s.comment ? ` — “${s.comment}”` : ""}</p>}
                    {s.branches ? (
                      <ul className="wf_lanes_run">
                        {s.branches.map((b) => (
                          <li key={b.id} className={`wf_lane_run wf_lane_run--${b.status}`}>
                            <div className="wf_lane_run__head">
                              <Icon status={b.status === "pending" ? "skipped" : b.status} />
                              {b.agent_icon && <AgentAvatar icon={b.agent_icon} />} <strong>{b.label}</strong>
                              <span className="ag_muted ag_small">{b.agent_name}</span>
                            </div>
                            {b.error && <div className="ag_error">{b.error}</div>}
                            {b.output && <MarkdownOutput text={b.output} />}
                          </li>
                        ))}
                      </ul>
                    ) : s.output && <MarkdownOutput text={s.output} />}
                  </div>
                )}
              </li>
            ))}
          </ol>

          {live && <Button variant="ghost" onClick={onCancel}><Square size={13} /> Cancel run</Button>}
          {["failed", "rejected"].includes(active.status) && active.error && <div className="ag_error">{active.error}</div>}
          {active.output && (
            <div className="pl_final">
              <div className="ag_section__head">
                <span className="ag_field__label">Final output</span>
                <Button variant="ghost" onClick={async () => { await navigator.clipboard.writeText(active.output ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                  {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                </Button>
              </div>
              <MarkdownOutput text={active.output} className="pl_final__text" />
            </div>
          )}
        </section>
      )}

      {runs.length > 1 && (
        <section className="ag_section">
          <h2 className="ag_section__title">History</h2>
          <div className="pl_history">
            {runs.map((r) => (
              <button key={r.id} type="button" className={`pl_history__item ${active?.id === r.id ? "is_active" : ""}`} onClick={() => { onPick(r); setOpen(null); }}>
                <span className={`ag_status ag_status--${r.status}`}>{STATUS_TEXT[r.status]}</span>
                <span className="ag_small">#{r.id} · {fmtTime(r.started_at)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
