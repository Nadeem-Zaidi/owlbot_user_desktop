import { useRef } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Field, Toggle } from "@/shared/ui/ui";
import type { FlowNode, ParallelBranch } from "@/features/pipelines/api/pipelines_api";
import { providerLabel, stepKey, type StepAgent } from "@/features/pipelines/api/pipeline_agents";
import { MAX_PARALLEL_BRANCHES, newBranch, outputRefs, TYPE_LABEL, type StepNode } from "@/features/pipelines/lib/flow_graph";
import { RouterEditor, RuleRow, SourceSelect } from "@/features/pipelines/components/router_editor";

type Props = {
  node: FlowNode;
  agents: StepAgent[];
  before: StepNode[];           // steps that run earlier (for {{node.id}})
  onChange: (node: FlowNode) => void;
  onDelete: () => void;
  onClose: () => void;
  // Opens "New agent" for this step (Workflows editor).
  onCreateAgent?: () => void;
};

// A textarea with buttons that insert {{input}}, {{previous}} and earlier steps' outputs.
const TemplateField = ({ label, value, onChange, before, rows = 4, hint, max = 4000 }: {
  label: string; value: string; onChange: (v: string) => void; before: StepNode[]; rows?: number; hint?: string; max?: number;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (token: string) => {
    const el = ref.current;
    const at = el ? el.selectionStart : value.length;
    onChange(value.slice(0, at) + token + value.slice(el ? el.selectionEnd : at));
    requestAnimationFrame(() => el?.focus());
  };
  return (
    <Field label={label} hint={hint}>
      <textarea ref={ref} className="ag_input" rows={rows} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
      <div className="wf_tokens">
        <button type="button" className="ag_chip ag_chip--button" onClick={() => insert("{{input}}")}>run input</button>
        <button type="button" className="ag_chip ag_chip--button" onClick={() => insert("{{previous}}")}>previous step</button>
        {outputRefs(before).map((o) => (
          <button key={o.ref} type="button" className="ag_chip ag_chip--button" onClick={() => insert(`{{${o.ref}}}`)}>{o.label}</button>
        ))}
      </div>
    </Field>
  );
};

// Picks one of the user's agents (or provider agents) for a step.
const AgentSelect = ({ kind, agentId, agents, onPick, onCreateAgent }: {
  kind: "agent" | "native"; agentId: string; agents: StepAgent[];
  onPick: (kind: "agent" | "native", id: string) => void; onCreateAgent?: () => void;
}) => {
  const regular = agents.filter((a) => a.kind === "agent");
  const native = agents.filter((a) => a.kind === "native");
  return (
    <select className="ag_input" value={stepKey({ kind, agent_id: agentId })}
      onChange={(e) => {
        if (e.target.value === "__new__") return onCreateAgent?.();
        const [k, ...rest] = e.target.value.split(":");
        onPick(k as "agent" | "native", rest.join(":"));
      }}>
      {!agents.some((a) => a.id === agentId) && <option value={stepKey({ kind, agent_id: agentId })}>Choose an agent…</option>}
      {onCreateAgent && <option value="__new__">＋ Create a new agent…</option>}
      {regular.length > 0 && <optgroup label="Agents">{regular.map((a) => <option key={a.id} value={`agent:${a.id}`}>{a.icon} {a.name}</option>)}</optgroup>}
      {native.length > 0 && (
        <optgroup label="Provider agents">
          {native.map((a) => <option key={a.id} value={`native:${a.id}`} disabled={!a.active}>{a.icon} {a.name} · {providerLabel(a.provider)}{a.active ? "" : " (switched off)"}</option>)}
        </optgroup>
      )}
    </select>
  );
};

// A parallel step: its agents (each with a name and a task) run at the same time.
const ParallelEditor = ({ node, agents, before, onChange }: {
  node: Extract<FlowNode, { type: "parallel" }>; agents: StepAgent[]; before: StepNode[]; onChange: (node: FlowNode) => void;
}) => {
  const setBranch = (i: number, p: Partial<ParallelBranch>) => onChange({ ...node, branches: node.branches.map((b, k) => (k === i ? { ...b, ...p } : b)) });
  const labels = node.branches.map((b) => b.label.trim().toLowerCase());
  return (
    <>
      <p className="ag_muted ag_small">
        These agents work on the same input <strong>at the same time</strong>. The next step gets all their answers, each under its name —
        or use one answer with its button below.
      </p>
      <ol className="wf_lanes">
        {node.branches.map((b, i) => {
          const dup = b.label.trim() && labels.filter((l) => l === b.label.trim().toLowerCase()).length > 1;
          return (
            <li key={b.id} className="wf_lane">
              <div className="wf_lane__head">
                <input className={`ag_input ${dup || !b.label.trim() ? "is_missing" : ""}`} value={b.label} maxLength={40} placeholder="Name, e.g. Research"
                  aria-label={`Agent ${i + 1} name`} onChange={(e) => setBranch(i, { label: e.target.value })} />
                <button type="button" className="ag_icon_btn" aria-label="Remove agent" disabled={node.branches.length <= 2}
                  title={node.branches.length <= 2 ? "A parallel step needs at least two agents" : "Remove"}
                  onClick={() => onChange({ ...node, branches: node.branches.filter((_, k) => k !== i) })}><Trash2 size={14} /></button>
              </div>
              {dup && <p className="ag_error ag_small">Two agents have this name.</p>}
              <AgentSelect kind={b.agent_kind} agentId={b.agent_id} agents={agents}
                onPick={(kind, id) => {
                  // Names that were just the agent's name follow the new pick.
                  const picked = agents.find((a) => a.id === id);
                  const unnamed = !b.label.trim() || /^Agent \d+$/.test(b.label) || agents.some((a) => a.name.slice(0, 40) === b.label);
                  setBranch(i, { agent_kind: kind, agent_id: id, ...(picked && unnamed ? { label: picked.name.slice(0, 40) } : {}) });
                }} />
              <TemplateField label="Task" value={b.instruction} onChange={(v) => setBranch(i, { instruction: v })} before={before} rows={3} />
            </li>
          );
        })}
      </ol>
      {node.branches.length < MAX_PARALLEL_BRANCHES && (
        <button type="button" className="wf_link_btn"
          onClick={() => onChange({ ...node, branches: [...node.branches, newBranch(node.branches.length + 1, agents.find((a) => a.active && !node.branches.some((b) => b.agent_id === a.id)))] })}>
          <Plus size={13} /> Add an agent
        </button>
      )}
      <Toggle checked={!node.require_all} onChange={(v) => onChange({ ...node, require_all: !v })}
        label={node.require_all ? "Stop the run if any agent fails" : "Continue if at least one agent answers"} />
    </>
  );
};

export const FlowInspector = ({ node, agents, before, onChange, onDelete, onClose, onCreateAgent }: Props) => {
  const patch = (p: Partial<FlowNode>) => onChange({ ...node, ...p } as FlowNode);

  return (
    <div className="wf_inspector">
      <div className="wf_inspector__head">
        <span className="ag_chip">{TYPE_LABEL[node.type]}</span>
        <button type="button" className="ag_icon_btn" aria-label="Close" onClick={onClose}><X size={16} /></button>
      </div>
      <Field label="Step name">
        <input className="ag_input" value={node.label ?? ""} maxLength={60} placeholder={TYPE_LABEL[node.type]} onChange={(e) => patch({ label: e.target.value || undefined })} />
      </Field>

      {node.type === "start" && <p className="ag_muted ag_small">Where every run begins. Its output is the input you type when you run the workflow — use <code>{"{{input}}"}</code> anywhere.</p>}

      {node.type === "agent" && (
        <>
          <Field label="Agent">
            <AgentSelect kind={node.agent_kind} agentId={node.agent_id} agents={agents} onCreateAgent={onCreateAgent}
              onPick={(agent_kind, agent_id) => patch({ agent_kind, agent_id })} />
          </Field>
          {onCreateAgent && (
            <button type="button" className="wf_link_btn" onClick={onCreateAgent}><Plus size={13} /> New agent for this step</button>
          )}
          <TemplateField label="Task" value={node.instruction} onChange={(v) => patch({ instruction: v })} before={before}
            hint="Without any placeholder, the previous step's output is added at the end." />
        </>
      )}

      {node.type === "parallel" && <ParallelEditor node={node} agents={agents} before={before} onChange={onChange} />}

      {node.type === "condition" && (
        <>
          <div className="sk_modes" role="radiogroup" aria-label="Condition type">
            <label className={`sk_mode ${node.mode === "rule" ? "is_on" : ""}`}>
              <input type="radio" checked={node.mode === "rule"} onChange={() => onChange({ id: node.id, type: "condition", position: node.position, label: node.label, mode: "rule", source: node.source, op: "contains", value: "" })} /> Rule
            </label>
            <label className={`sk_mode ${node.mode === "ai" ? "is_on" : ""}`}>
              <input type="radio" checked={node.mode === "ai"} onChange={() => onChange({ id: node.id, type: "condition", position: node.position, label: node.label, mode: "ai", source: node.source, question: "" })} /> Ask AI (yes/no)
            </label>
          </div>
          <SourceSelect value={node.source} before={before} onChange={(source) => patch({ source })} />
          {node.mode === "rule" ? (
            <RuleRow rule={{ field: node.field, op: node.op, value: node.value }}
              onChange={(r) => onChange({ id: node.id, type: "condition", position: node.position, label: node.label, mode: "rule", source: node.source, ...(r.field ? { field: r.field } : {}), op: r.op, value: r.value })} />
          ) : (
            <Field label="Question" hint="Answered YES or NO by your default model.">
              <input className="ag_input" value={node.question} maxLength={500} placeholder="Is the invoice amount over ₹50,000?" onChange={(e) => patch({ question: e.target.value })} />
            </Field>
          )}
          {node.mode === "rule" && node.op.startsWith("number") && (
            <p className="ag_muted ag_small">Leave the field empty to check the whole text. Numbers use the first amount with a currency (₹62,000, $1,500), otherwise the first plain number — ids like INV-7 are skipped.</p>
          )}
          <p className="ag_muted ag_small">Connect the <strong>Yes</strong> and <strong>No</strong> outputs to the next steps.</p>
        </>
      )}

      {node.type === "router" && <RouterEditor node={node} before={before} onChange={onChange} />}

      {node.type === "approval" && (
        <>
          <TemplateField label="What to ask" value={node.message} onChange={(v) => patch({ message: v })} before={before} max={2000}
            hint="Shown on the run with Approve / Reject. The run pauses here — even for days." />
          <Toggle checked={node.notify} onChange={(v) => patch({ notify: v })} label={node.notify ? "Notify me on WhatsApp / Telegram" : "Don't notify"} />
          <p className="ag_muted ag_small">Connect <strong>Approved</strong> (required) and <strong>Rejected</strong> (optional — without it, a rejection ends the run).</p>
        </>
      )}

      {node.type === "notify" && (
        <TemplateField label="Message" value={node.message} onChange={(v) => patch({ message: v })} before={before} max={2000}
          hint="Sent to your linked WhatsApp, or Telegram if WhatsApp isn't linked." />
      )}

      {node.type === "end" && (
        <TemplateField label="Final output" value={node.output} onChange={(v) => patch({ output: v })} before={before} rows={3} max={2000} />
      )}

      {node.type !== "start" && (
        <button type="button" className="wf_inspector__delete" onClick={onDelete}><Trash2 size={14} /> Delete step</button>
      )}
    </div>
  );
};
