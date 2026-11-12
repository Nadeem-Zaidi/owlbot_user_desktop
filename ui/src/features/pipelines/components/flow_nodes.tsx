import { memo, useEffect } from "react";
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import { Bell, CheckCircle2, CirclePlay, Columns3, Flag, GitFork, LoaderCircle, PauseCircle, Route as RouteIcon, ShieldCheck, XCircle } from "lucide-react";
import { AgentAvatar } from "@/shared/ui/agent_avatar";
import { nodeLabel, RULE_LABEL, type StepNode } from "@/features/pipelines/lib/flow_graph";

const ICON = {
  start: <CirclePlay size={15} />, parallel: <Columns3 size={15} />, condition: <GitFork size={15} />, router: <RouteIcon size={15} />, approval: <ShieldCheck size={15} />,
  notify: <Bell size={15} />, end: <Flag size={15} />,
};

const StatusBadge = ({ status }: { status?: string }) => {
  if (!status) return null;
  if (status === "running") return <LoaderCircle size={15} className="spin wf_node__st wf_node__st--running" aria-label="running" />;
  if (status === "succeeded") return <CheckCircle2 size={15} className="wf_node__st wf_node__st--ok" aria-label="done" />;
  if (status === "waiting") return <PauseCircle size={15} className="wf_node__st wf_node__st--wait" aria-label="waiting for approval" />;
  return <XCircle size={15} className="wf_node__st wf_node__st--bad" aria-label={status} />;
};

const summary = (n: StepNode["data"]["node"], agentName?: string): string => {
  switch (n.type) {
    case "start": return "The run's input";
    case "agent": return agentName ?? "Choose an agent";
    case "parallel": return `${n.branches.length} agents at once${n.require_all ? "" : " · continues if some fail"}`;
    case "condition": return n.mode === "ai" ? `Ask AI: ${n.question || "…"}` : `${n.field || n.source} ${RULE_LABEL[n.op]} ${n.value}`.trim();
    case "router": return `${n.mode === "ai" ? "AI picks" : "First match"} of ${n.routes.length} route${n.routes.length === 1 ? "" : "s"}`;
    case "approval": return n.notify ? "Waits for you · notifies you" : "Waits for you";
    case "notify": return "Message to WhatsApp / Telegram";
    case "end": return "Finish with the output";
  }
};

// A router's outputs: one per route, then Otherwise, spread along the bottom.
const RouterOutputs = ({ id, node }: { id: string; node: Extract<StepNode["data"]["node"], { type: "router" }> }) => {
  const outs = [...node.routes.map((r) => ({ handle: `route:${r.id}`, label: r.label || "Route" })), { handle: "default", label: "Otherwise" }];
  // React Flow caches handle positions; re-measure when routes change.
  const update = useUpdateNodeInternals();
  const key = outs.map((o) => o.handle).join("|");
  useEffect(() => update(id), [id, key, update]);
  return (
    <>
      {outs.map((o, i) => (
        <Handle key={o.handle} type="source" id={o.handle} position={Position.Bottom}
          className={`wf_handle ${o.handle === "default" ? "wf_handle--default" : "wf_handle--route"}`}
          style={{ left: `${((i + 0.5) / outs.length) * 100}%` }} />
      ))}
      <div className="wf_node__outs wf_node__outs--grid" style={{ gridTemplateColumns: `repeat(${outs.length}, minmax(0, 1fr))` }}>
        {outs.map((o) => <span key={o.handle} title={o.label}>{o.label}</span>)}
      </div>
    </>
  );
};

// One step on the canvas. Branching steps have labelled outputs.
export const StepNodeCard = memo(({ id, data, selected }: NodeProps<StepNode>) => {
  const n = data.node;
  const wide = n.type === "router" ? { minWidth: Math.min(200 + (n.routes.length + 1) * 56, 720) } : undefined;
  return (
    <div className={`wf_node wf_node--${n.type} ${selected ? "is_selected" : ""} ${data.status ? `is_${data.status}` : ""}`} style={wide}>
      {n.type !== "start" && <Handle type="target" position={Position.Top} className="wf_handle" />}
      <div className="wf_node__head">
        <span className="wf_node__icon">{n.type === "agent" ? (data.agent ? <AgentAvatar icon={data.agent.icon} /> : "❔") : ICON[n.type]}</span>
        <strong className="wf_node__title">{nodeLabel(n)}</strong>
        <StatusBadge status={data.status} />
      </div>
      <div className="wf_node__sub">{summary(n, data.agent?.name)}</div>
      {n.type === "parallel" && (
        <ul className="wf_node__lanes">
          {n.branches.map((b, i) => (
            <li key={b.id} title={data.branchAgents?.[i]?.name ?? "Choose an agent"}>
              {data.branchAgents?.[i] ? <AgentAvatar icon={data.branchAgents[i]!.icon} /> : "❔"} <span>{b.label || "Agent"}</span>
            </li>
          ))}
        </ul>
      )}

      {(n.type === "start" || n.type === "agent" || n.type === "parallel" || n.type === "notify") && <Handle type="source" position={Position.Bottom} className="wf_handle" />}
      {n.type === "condition" && (
        <>
          <Handle type="source" id="true" position={Position.Bottom} className="wf_handle wf_handle--true" style={{ left: "28%" }} />
          <Handle type="source" id="false" position={Position.Bottom} className="wf_handle wf_handle--false" style={{ left: "72%" }} />
          <div className="wf_node__outs"><span>Yes</span><span>No</span></div>
        </>
      )}
      {n.type === "router" && <RouterOutputs id={id} node={n} />}
      {n.type === "approval" && (
        <>
          <Handle type="source" id="approved" position={Position.Bottom} className="wf_handle wf_handle--true" style={{ left: "28%" }} />
          <Handle type="source" id="rejected" position={Position.Bottom} className="wf_handle wf_handle--false" style={{ left: "72%" }} />
          <div className="wf_node__outs"><span>Approved</span><span>Rejected</span></div>
        </>
      )}
    </div>
  );
});
StepNodeCard.displayName = "StepNodeCard";
