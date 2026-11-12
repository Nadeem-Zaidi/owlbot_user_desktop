import type { Edge, Node } from "@xyflow/react";
import type { Branch, Flow, FlowNode, FlowTraceEntry, NodeType, ParallelBranch, Route } from "@/features/pipelines/api/pipelines_api";
import type { StepAgent } from "@/features/pipelines/api/pipeline_agents";

// The workflow editor works on React Flow nodes/edges; the server stores a
// Flow. These convert between the two and hold the small helpers the editor
// components share.

export type RunStatus = FlowTraceEntry["status"];
// `branchAgents`: a parallel step's agents, in branch order.
export type StepNodeData = { node: FlowNode; status?: RunStatus; agent?: StepAgent; branchAgents?: (StepAgent | undefined)[] };
export type StepNode = Node<StepNodeData>;

export const TYPE_LABEL: Record<NodeType, string> = {
  start: "Start", agent: "Agent", parallel: "Parallel", condition: "Condition", router: "Router", approval: "Approval", notify: "Notify", end: "End",
};

const FIXED_BRANCH: Record<string, string> = { true: "Yes", false: "No", approved: "Approved", rejected: "Rejected", default: "Otherwise" };

// The name shown for an output: fixed ones, or a router route's current name.
export function branchLabel(branch: string | null | undefined, node?: FlowNode): string | undefined {
  if (!branch) return undefined;
  if (branch.startsWith("route:")) {
    const route = node?.type === "router" ? node.routes.find((r) => `route:${r.id}` === branch) : undefined;
    return route?.label || "Route";
  }
  return FIXED_BRANCH[branch];
}

// CSS modifier for an output's colour (routes share one).
export const branchClass = (branch: string) => (branch.startsWith("route:") ? "route" : branch);

export const RULE_LABEL: Record<string, string> = {
  contains: "contains", not_contains: "doesn't contain", equals: "equals", starts_with: "starts with", ends_with: "ends with",
  one_of: "is one of", matches: "matches pattern",
  number_gt: "number >", number_gte: "number ≥", number_lt: "number <", number_lte: "number ≤", number_between: "number between",
  is_empty: "is empty", not_empty: "isn't empty", exists: "field exists", not_exists: "field is missing",
};

export const nodeLabel = (n: FlowNode) => n.label || TYPE_LABEL[n.type];

export function toGraph(flow: Flow): { nodes: StepNode[]; edges: Edge[] } {
  return {
    nodes: flow.nodes.map((n) => ({ id: n.id, type: "step", position: n.position, data: { node: n }, deletable: n.type !== "start" })),
    edges: flow.edges.map((e) => toEdge(e)),
  };
}

export function toEdge(e: { id: string; from: string; to: string; branch?: Branch }): Edge {
  return {
    id: e.id,
    source: e.from,
    target: e.to,
    sourceHandle: e.branch ?? null,
    className: e.branch ? `wf_edge wf_edge--${branchClass(e.branch)}` : "wf_edge",
  };
}

export function toFlow(nodes: StepNode[], edges: Edge[]): Flow {
  return {
    version: 1,
    nodes: nodes.map((n) => ({ ...n.data.node, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } })),
    edges: edges.map((e) => ({ id: e.id, from: e.source, to: e.target, ...(e.sourceHandle ? { branch: e.sourceHandle as Branch } : {}) })),
  };
}

const newId = (type: NodeType) => `${type}_${Math.random().toString(36).slice(2, 7)}`;

export const newRoute = (n: number, mode: "rule" | "ai"): Route => ({
  id: `r_${Math.random().toString(36).slice(2, 8)}`,
  label: `Route ${n}`,
  when: { match: "all", rules: mode === "rule" ? [{ op: "contains", value: "" }] : [] },
  ...(mode === "ai" ? { description: "" } : {}),
});

export const MAX_PARALLEL_BRANCHES = 5;

export const newBranch = (n: number, agent?: StepAgent): ParallelBranch => ({
  id: `b_${Math.random().toString(36).slice(2, 8)}`,
  label: agent?.name.slice(0, 40) || `Agent ${n}`,
  agent_kind: agent?.kind ?? "agent",
  agent_id: agent?.id ?? "",
  instruction: "{{previous}}",
});

// `agents`: the usable agents (a parallel step starts with the first two).
export function newNode(type: NodeType, position: { x: number; y: number }, agent?: StepAgent, agents: StepAgent[] = []): FlowNode {
  const id = newId(type);
  switch (type) {
    case "agent":
      return { id, type, position, agent_kind: agent?.kind ?? "agent", agent_id: agent?.id ?? "", instruction: "{{previous}}" };
    case "parallel": {
      const a = newBranch(1, agents[0]), b = newBranch(2, agents[1]);
      if (a.label === b.label) b.label = `${b.label} 2`.slice(0, 40);
      return { id, type, position, branches: [a, b], require_all: true };
    }
    case "condition":
      return { id, type, position, mode: "rule", source: "previous", op: "contains", value: "" };
    case "router":
      return { id, type, position, mode: "rule", source: "previous", routes: [newRoute(1, "rule"), newRoute(2, "rule")] };
    case "approval":
      return { id, type, position, message: "Approve to continue?\n\n{{previous}}", notify: true };
    case "notify":
      return { id, type, position, message: "{{previous}}" };
    case "end":
      return { id, type, position, output: "{{previous}}" };
    default:
      return { id, type: "start", position };
  }
}

// New workflow: Start → (first agent) → End.
export function starterFlow(agent?: StepAgent): Flow {
  const start: FlowNode = { id: "start", type: "start", position: { x: 0, y: 0 } };
  const end: FlowNode = { id: "end", type: "end", position: { x: 0, y: agent ? 300 : 160 }, output: "{{previous}}" };
  if (!agent) return { version: 1, nodes: [start, end], edges: [{ id: "start-end", from: "start", to: "end" }] };
  const a: FlowNode = { id: "agent_1", type: "agent", position: { x: 0, y: 150 }, agent_kind: agent.kind, agent_id: agent.id, instruction: "{{input}}" };
  return { version: 1, nodes: [start, a, end], edges: [{ id: "start-agent_1", from: "start", to: "agent_1" }, { id: "agent_1-end", from: "agent_1", to: "end" }] };
}

// The outputs a later step can use: agent steps, and each parallel step
// (all answers) plus each of its agents.
export function outputRefs(before: StepNode[]): { ref: string; label: string }[] {
  return before.flatMap((b) => {
    const n = b.data.node;
    if (n.type === "agent") return [{ ref: `node.${b.id}`, label: nodeLabel(n) }];
    if (n.type === "parallel") {
      return [{ ref: `node.${b.id}`, label: `${nodeLabel(n)} (all)` },
        ...n.branches.map((br) => ({ ref: `node.${b.id}.${br.id}`, label: `${nodeLabel(n)} → ${br.label || "Agent"}` }))];
    }
    return [];
  });
}

// Steps that run before `id` (for {{node.<id>}} buttons and condition sources).
export function upstream(id: string, nodes: StepNode[], edges: Edge[]): StepNode[] {
  const before = new Set<string>();
  const walk = (to: string) => {
    for (const e of edges) if (e.target === to && !before.has(e.source)) { before.add(e.source); walk(e.source); }
  };
  walk(id);
  return nodes.filter((n) => before.has(n.id) && n.data.node.type !== "start");
}

// Latest status of each node in a workflow run.
export function statusByNode(trace: FlowTraceEntry[] | undefined): Map<string, RunStatus> {
  const m = new Map<string, RunStatus>();
  for (const t of trace ?? []) m.set(t.node_id, t.status);
  return m;
}

export const isTrace = (steps: unknown[]): steps is FlowTraceEntry[] => steps.every((s) => typeof s === "object" && s !== null && "node_id" in s);
