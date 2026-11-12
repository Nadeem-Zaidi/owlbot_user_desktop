import { memo, useEffect } from "react";
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import {
  Bell, Bot, BookOpen, Brain, CheckCircle2, CirclePlay, Clock, Code2, Flag, GitFork, Globe, Library, LoaderCircle, MessageSquare, PauseCircle, Plug, Plus,
  Route as RouteIcon, ShieldCheck, Webhook, Wrench, XCircle,
} from "lucide-react";
import { AgentAvatar } from "@/shared/ui/agent_avatar";
import { RULE_LABEL } from "@/features/pipelines/lib/flow_graph";
import { nodeName, PORT_LABEL, PORTS, type CanvasNode } from "@/features/studio/lib/studio_graph";

const StatusBadge = ({ status }: { status?: string }) => {
  if (!status) return null;
  if (status === "running") return <LoaderCircle size={15} className="spin as_st as_st--running" aria-label="running" />;
  if (status === "succeeded") return <CheckCircle2 size={15} className="as_st as_st--ok" aria-label="done" />;
  if (status === "waiting") return <PauseCircle size={15} className="as_st as_st--wait" aria-label="waiting for approval" />;
  return <XCircle size={15} className="as_st as_st--bad" aria-label={status} />;
};

const cls = (base: string, selected: boolean, status?: string) => `${base} ${selected ? "is_selected" : ""} ${status ? `is_${status}` : ""}`;

// ── trigger ──
const TRIGGER_ICON = { manual: <CirclePlay size={18} />, schedule: <Clock size={18} />, webhook: <Webhook size={18} />, chat: <MessageSquare size={18} /> };
export const TriggerNode = memo(({ data, selected }: NodeProps<CanvasNode>) => {
  const n = data.node;
  if (n.type !== "trigger") return null;
  const t = n.trigger;
  const title = t.type === "manual" ? "Manual run" : t.type === "schedule" ? "Schedule" : t.type === "webhook" ? "Webhook" : "Chat command";
  const sub = t.type === "manual" ? "When you click Run" : t.type === "schedule" ? (t.timing.frequency === "hourly" ? `Every ${t.timing.interval_hours ?? 1} h` : `${t.timing.frequency} · ${t.timing.time_of_day ?? ""}`)
    : t.type === "webhook" ? "When the URL is called" : `/${t.command || "command"} in WhatsApp / Telegram`;
  return (
    <div className={cls("as_node as_trigger", selected, data.status)}>
      <span className="as_trigger__icon">{TRIGGER_ICON[t.type]}</span>
      <div className="as_node__text">
        <strong>{n.label || title}</strong>
        <span>{sub}</span>
      </div>
      <StatusBadge status={data.status} />
      <Handle type="source" position={Position.Right} className="as_handle" />
    </div>
  );
});
TriggerNode.displayName = "TriggerNode";

// ── agent: ports for model / tools / knowledge / skills along the bottom ──
export const AgentNode = memo(({ data, selected }: NodeProps<CanvasNode>) => {
  const n = data.node;
  if (n.type !== "agent") return null;
  const subs = data.subs ?? [];
  const count = (t: string) => subs.filter((s) => s.type === t).length;
  const model = subs.find((s) => s.type === "model");
  return (
    <div className={cls("as_node as_agent", selected, data.status)}>
      <Handle type="target" id="in" position={Position.Left} className="as_handle" />
      <div className="as_agent__head">
        <span className="as_agent__avatar"><AgentAvatar icon={n.agent.icon || "🤖"} /></span>
        <div className="as_node__text">
          <strong>{nodeName(n)}</strong>
          <span>{data.shared ? "Same agent again · settings shared" : n.agent_id ? "AI agent" : "New agent — created on save"}</span>
        </div>
        <StatusBadge status={data.status} />
      </div>
      {data.extras && (data.extras.mcp.length > 0 || data.extras.functions > 0 || data.extras.codeFunctions > 0 || (data.extras.helpers ?? []).length > 0) && (
        <div className="as_agent__extras">
          {data.extras.mcp.map((m) => (
            <span key={m.name} className="as_extra as_extra--mcp" title={`MCP server: ${m.on} of ${m.total} tools on`}><Plug size={11} /> {m.name} · {m.on} tools</span>
          ))}
          {data.extras.functions > 0 && <span className="as_extra" title="HTTP functions"><Globe size={11} /> {data.extras.functions} function{data.extras.functions === 1 ? "" : "s"}</span>}
          {data.extras.codeFunctions > 0 && <span className="as_extra" title="Python code functions"><Code2 size={11} /> {data.extras.codeFunctions} code</span>}
          {(data.extras.helpers ?? []).length > 0 && (
            <span className="as_extra as_extra--helper" title={`Can ask: ${data.extras.helpers!.join(", ")}`}><Bot size={11} /> asks {data.extras.helpers!.join(", ")}</span>
          )}
        </div>
      )}
      <div className="as_agent__ports">
        {PORTS.map((p) => {
          const c = p === "model" ? (model ? 1 : 0) : count(p === "tools" ? "tool" : p === "skills" ? "skill" : "knowledge");
          const full = p === "model" && !!model;
          return (
            <div key={p} className="as_port">
              <span className="as_port__label">{PORT_LABEL[p]}{c > 0 && p !== "model" ? ` · ${c}` : ""}</span>
              {!full && (
                <button type="button" className="as_port__add nodrag" title={`Add ${PORT_LABEL[p].toLowerCase()}`} aria-label={`Add ${PORT_LABEL[p].toLowerCase()} to ${nodeName(n)}`}
                  onClick={(e) => { e.stopPropagation(); data.onAdd?.(p); }}>
                  <Plus size={12} />
                </button>
              )}
              <Handle type="target" id={p} position={Position.Bottom} className={`as_handle as_handle--port as_handle--${p}`} />
            </div>
          );
        })}
      </div>
      <Handle type="source" position={Position.Right} className="as_handle" />
    </div>
  );
});
AgentNode.displayName = "AgentNode";

// ── sub-nodes (round, plug into an agent's port) ──
const SUB_ICON = { model: <Brain size={18} />, tool: <Wrench size={18} />, knowledge: <BookOpen size={18} />, skill: <Library size={18} /> };
export const SubNodeCard = memo(({ data, selected }: NodeProps<CanvasNode>) => {
  const n = data.node;
  if (n.type !== "model" && n.type !== "tool" && n.type !== "knowledge" && n.type !== "skill") return null;
  const labels = data.labels ?? {};
  const text = n.type === "model" ? (n.model || labels[`provider:${n.provider}`] || "Default model")
    : n.type === "tool" ? (labels[`tool:${n.tool}`] ?? n.tool)
      : n.type === "knowledge" ? `${n.document_keys.length} document${n.document_keys.length === 1 ? "" : "s"}`
        : n.skill_id === "*" ? "All skills" : (labels[`skill:${n.skill_id}`] ?? "Skill");
  return (
    <div className={cls(`as_sub as_sub--${n.type}`, selected)}>
      <Handle type="source" id="plug" position={Position.Top} className="as_handle as_handle--plug" />
      <span className="as_sub__icon">{SUB_ICON[n.type]}</span>
      <span className="as_sub__label" title={text}>{text}</span>
    </div>
  );
});
SubNodeCard.displayName = "SubNodeCard";

// ── flow steps (same settings as Workflows; outputs on the right) ──
const STEP_ICON = { condition: <GitFork size={15} />, router: <RouteIcon size={15} />, approval: <ShieldCheck size={15} />, notify: <Bell size={15} />, end: <Flag size={15} /> };
export const StepNodeCard = memo(({ id, data, selected }: NodeProps<CanvasNode>) => {
  const n = data.node;
  const update = useUpdateNodeInternals();
  const outs = n.type === "condition" ? [{ h: "true", l: "Yes" }, { h: "false", l: "No" }]
    : n.type === "approval" ? [{ h: "approved", l: "Approved" }, { h: "rejected", l: "Rejected" }]
      : n.type === "router" ? [...n.routes.map((r) => ({ h: `route:${r.id}`, l: r.label || "Route" })), { h: "default", l: "Otherwise" }]
        : n.type === "notify" ? [{ h: "", l: "" }] : [];
  const key = outs.map((o) => o.h).join("|");
  useEffect(() => update(id), [id, key, update]);
  if (!(n.type in STEP_ICON)) return null;
  const sub = n.type === "condition" ? (n.mode === "ai" ? `AI: ${n.question || "…"}` : `${n.field || n.source} ${RULE_LABEL[n.op]} ${n.value}`.trim())
    : n.type === "router" ? `${n.mode === "ai" ? "AI picks" : "First match"} · ${n.routes.length} route${n.routes.length === 1 ? "" : "s"}`
      : n.type === "approval" ? "Waits for you" : n.type === "notify" ? "Message to your phone" : "Finish";
  const branching = outs.length > 1;
  return (
    <div className={cls(`as_node as_step as_step--${n.type}`, selected, data.status)} style={branching ? { minHeight: 40 + outs.length * 24 } : undefined}>
      <Handle type="target" id="in" position={Position.Left} className="as_handle" />
      <div className="as_step__body">
        <span className="as_step__icon">{STEP_ICON[n.type as keyof typeof STEP_ICON]}</span>
        <div className="as_node__text">
          <strong>{nodeName(n)}</strong>
          <span>{sub}</span>
        </div>
        <StatusBadge status={data.status} />
      </div>
      {branching && (
        <div className="as_outs">
          {outs.map((o) => <span key={o.h} className={`as_out as_out--${o.h.startsWith("route:") ? "route" : o.h}`}>{o.l}</span>)}
        </div>
      )}
      {outs.map((o, i) => (
        <Handle key={o.h || "out"} type="source" id={o.h || undefined} position={Position.Right}
          className={`as_handle ${branching ? `as_handle--${o.h.startsWith("route:") ? "route" : o.h}` : ""}`}
          style={branching ? { top: `${((i + 0.5) / outs.length) * 100}%` } : undefined} />
      ))}
    </div>
  );
});
StepNodeCard.displayName = "StepNodeCard";
