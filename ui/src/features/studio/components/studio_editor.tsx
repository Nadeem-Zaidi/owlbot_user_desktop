import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  addEdge, applyEdgeChanges, applyNodeChanges, Background, Controls, MiniMap, ReactFlow,
  type Connection, type Edge, type EdgeChange, type NodeChange,
} from "@xyflow/react";
import { ArrowLeft, Bell, Bot, Check, Flag, GitFork, Route as RouteIcon, ShieldCheck } from "lucide-react";
import { Button, ErrorNote, Modal } from "@/shared/ui/ui";
import type { KnowledgeDocument } from "@/shared/types";
import { api } from "@/features/chat/api/chat_api";
import { agentsApi } from "@/features/agents/api/agents_api";
import type { AgentCatalog, AgentSummary } from "@/features/agents/types";
import { skillsApi, type SkillSummary } from "@/features/skills/api/skills_api";
import { pipelinesApi, type FlowNode, type FlowTraceEntry, type PipelineRun } from "@/features/pipelines/api/pipelines_api";
import { branchLabel, isTrace } from "@/features/pipelines/lib/flow_graph";
import { FlowRunPanel } from "@/features/pipelines/components/flow_run_panel";
import { CanvasViewbar } from "@/features/pipelines/components/canvas_viewbar";
import { useCanvasLayout } from "@/features/pipelines/lib/use_canvas_layout";
import { studioApi, type Port, type StudioCanvas, type StudioNode, type StudioNodeType, type StudioProject } from "@/features/studio/api/studio_api";
import {
  edgeTaken, expandParallel, isSub, newStudioNode, passedOut, PORT_SUB, primaryNodes, SUB_PORT, subsFromAgent, subsOf, toCanvas, type AgentExtras, toEdge, toGraph, traceByNode, uniqueAgentName, upstream, type CanvasNode,
} from "@/features/studio/lib/studio_graph";
import { blankCanvas, TEMPLATES } from "@/features/studio/lib/studio_templates";
import { AgentNode, StepNodeCard, SubNodeCard, TriggerNode } from "@/features/studio/components/studio_nodes";
import { StudioInspector } from "@/features/studio/components/studio_inspector";
import { DataEdge, type DataEdgeData } from "@/features/studio/components/studio_edges";
import { MarkdownOutput } from "@/features/chat/components/markdown_output";

const nodeTypes = { trigger: TriggerNode, agent: AgentNode, sub: SubNodeCard, step: StepNodeCard };
const edgeTypes = { data: DataEdge };
const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const kindOf = (n: StudioNode) => (n.type === "trigger" ? "trigger" : n.type === "agent" ? "agent" : isSub(n) ? "sub" : "step");

const ADD: { type: StudioNodeType; label: string; icon: React.ReactNode }[] = [
  { type: "agent", label: "Agent", icon: <Bot size={15} /> },
  { type: "condition", label: "Condition", icon: <GitFork size={15} /> },
  { type: "router", label: "Router", icon: <RouteIcon size={15} /> },
  { type: "approval", label: "Approval", icon: <ShieldCheck size={15} /> },
  { type: "notify", label: "Notify", icon: <Bell size={15} /> },
  { type: "end", label: "End", icon: <Flag size={15} /> },
];

// Agent Studio editor: an n8n-style canvas, left → right. Agents take a
// model, tools, knowledge and skills on their bottom ports; flow steps
// (conditions, routers, approvals) are the Workflows ones. Saving creates
// or updates real agents; Run shows each node's status live.
export const StudioEditor = () => {
  const { id: routeId } = useParams();
  const [search] = useSearchParams();
  const isNew = !routeId;
  const navigate = useNavigate();

  const [catalog, setCatalog] = useState<AgentCatalog | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  // The user's existing agents (to drop onto the canvas).
  const [myAgents, setMyAgents] = useState<AgentSummary[]>([]);
  const [agentMenu, setAgentMenu] = useState(false);
  // MCP servers / functions of the existing agents on the canvas.
  const [extras, setExtras] = useState<Record<string, AgentExtras>>({});
  // Full text passed along a connection (opened from its label after a run).
  const [passedView, setPassedView] = useState<{ title: string; text: string } | null>(null);
  // Answers from "Test this step", per node — the next step's test starts from them.
  const [testOutputs, setTestOutputs] = useState<Record<string, string>>({});
  const [project, setProject] = useState<StudioProject | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deliver, setDeliver] = useState(false);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [saved, setSaved] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [active, setActive] = useState<PipelineRun | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [starting, setStarting] = useState(false);
  const [rotating, setRotating] = useState(false);
  // The canvas mounts once the project is loaded, so its initial fitView sees the nodes.
  const [ready, setReady] = useState(false);
  const layout = useCanvasLayout("owl.studio");
  const { openPanel } = layout;
  // Parts (models, tools, knowledge, skills) can be hidden to declutter the
  // canvas; they stay plugged in and the agent cards still count them.
  const [partsHidden, setPartsHidden] = useState(() => {
    try {
      return localStorage.getItem("owl.studio.parts") === "hidden";
    } catch {
      return false;
    }
  });
  const showParts = useCallback((hidden: boolean) => {
    setPartsHidden(hidden);
    try {
      localStorage.setItem("owl.studio.parts", hidden ? "hidden" : "shown");
    } catch {
      // private mode etc. — just not remembered
    }
  }, []);

  const snapshot = (n: string, d: string, dl: boolean, c: StudioCanvas) => JSON.stringify({ n, d, dl, c });

  const showProject = useCallback((p: StudioProject) => {
    const g = toGraph(p.canvas);
    setProject(p);
    setName(p.name);
    setDescription(p.description);
    setDeliver(p.deliver_result);
    setNodes(g.nodes);
    setEdges(g.edges);
    setSaved(snapshot(p.name, p.description, p.deliver_result, toCanvas(g.nodes, g.edges)));
    setRuns(p.runs);
    setActive((a) => (a ? p.runs.find((r) => r.id === a.id) ?? a : p.runs[0] ?? null));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [cat, docs, sk] = await Promise.all([
          agentsApi.catalog(),
          api.getDocuments().catch(() => [] as KnowledgeDocument[]),
          skillsApi.list().catch(() => [] as SkillSummary[]),
        ]);
        setCatalog(cat);
        agentsApi.list().then((list) => setMyAgents(list ?? [])).catch(() => {});
        setDocuments(docs ?? []);
        setSkills(sk ?? []);
        if (isNew) {
          const template = TEMPLATES.find((t) => t.id === search.get("template"));
          const g = toGraph(template ? template.build() : blankCanvas());
          setNodes(g.nodes);
          setEdges(g.edges);
          setName(template?.name ?? "");
          setDeliver(template?.deliver_result ?? false);
          setReady(true);
          return;
        }
        showProject(await studioApi.getProject(routeId!));
        setReady(true);
      } catch (e) {
        setLoadError(errorText(e, "Couldn't load the project"));
      }
    })();
  }, [isNew, routeId, search, showProject]);

  // Follow the active run (quickly while running, slowly while it waits for an approval).
  const activeId = active?.id;
  const activeStatus = active?.status;
  useEffect(() => {
    if (!activeId || (activeStatus !== "running" && activeStatus !== "waiting")) return;
    const t = setInterval(async () => {
      try {
        const r = await pipelinesApi.getRun(activeId);
        setActive(r);
        setRuns((list) => list.map((x) => (x.id === r.id ? r : x)));
      } catch {
        // keep polling
      }
    }, activeStatus === "running" ? 1500 : 4000);
    return () => clearInterval(t);
  }, [activeId, activeStatus]);

  const traceList = useMemo(() => (active && isTrace(active.steps) ? expandParallel(active.steps as unknown as FlowTraceEntry[]) : []), [active]);
  const trace = useMemo(() => traceByNode(traceList), [traceList]);
  const traceOrder = useMemo(() => new Map(traceList.map((t, i) => [t.node_id, i])), [traceList]);
  const passed = useMemo(() => passedOut(traceList), [traceList]);
  const plainNodes = useMemo(() => nodes.map((n) => n.data.node), [nodes]);
  // Where each repeated agent's parts live (agent id → node id).
  const primary = useMemo(() => primaryNodes(plainNodes, edges), [plainNodes, edges]);

  // Load what each linked agent has besides its parts (once per agent).
  const linkedIds = useMemo(() => [...new Set(plainNodes.flatMap((n) => (n.type === "agent" && n.agent_id ? [n.agent_id] : [])))].sort().join(","), [plainNodes]);
  useEffect(() => {
    const missing = linkedIds.split(",").filter((id) => id && !(id in extras));
    if (!missing.length) return;
    setExtras((x) => ({ ...x, ...Object.fromEntries(missing.map((id) => [id, { mcp: [], functions: 0, codeFunctions: 0 }])) }));
    for (const id of missing) {
      agentsApi.getAgent(id).then((d) => setExtras((x) => ({
        ...x,
        [id]: {
          mcp: d.mcpServers.map((m) => ({ name: m.name, on: m.tools.filter((t) => t.enabled).length, total: m.tools.length })),
          functions: d.functions.filter((f) => f.enabled).length,
          codeFunctions: (d.codeFunctions ?? []).filter((f) => f.enabled).length,
          helpers: d.helper_agent_ids ?? [],
        },
      }))).catch(() => {});
    }
  }, [linkedIds, extras]);

  // Adds a model / tool / knowledge / skill under an agent and plugs it in.
  const addSub = useCallback((nodeId: string, port: Port) => {
    // A repeated agent's parts live on its primary node.
    const clicked = nodes.find((n) => n.id === nodeId)?.data.node;
    const agentId = clicked?.type === "agent" && clicked.agent_id ? primaryNodes(nodes.map((n) => n.data.node), edges).get(clicked.agent_id) ?? nodeId : nodeId;
    const agent = nodes.find((n) => n.id === agentId);
    if (!agent) return;
    const plugged = subsOf(agentId, nodes.map((n) => n.data.node), edges);
    if (port === "model" && plugged.some((s) => s.type === "model")) return;
    const usedTools = new Set(plugged.flatMap((s) => (s.type === "tool" ? [s.tool] : [])));
    const position = { x: agent.position.x - 30 + plugged.length * 88, y: agent.position.y + 190 };
    const node = newStudioNode(PORT_SUB[port], position, {
      provider: catalog?.defaultProvider,
      tool: catalog?.builtinTools.find((t) => !usedTools.has(t.id))?.id,
    });
    setNodes((ns) => [...ns, { id: node.id, type: "sub", position, data: { node }, deletable: true }]);
    setEdges((es) => [...es, toEdge({ id: `${node.id}-${agentId}`, from: node.id, to: agentId, port })]);
    setSelectedId(node.id);
    openPanel();
  }, [nodes, edges, catalog, openPanel]);

  const labels = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of catalog?.builtinTools ?? []) m[`tool:${t.id}`] = t.label;
    for (const p of catalog?.providers ?? []) m[`provider:${p.id}`] = p.label;
    for (const s of skills) m[`skill:${s.id}`] = s.name;
    return m;
  }, [catalog, skills]);

  const shown = useMemo(() => nodes.map((n) => {
    const node = n.data.node;
    const data = { ...n.data, status: trace.get(n.id)?.status };
    if (node.type === "agent") {
      const home = node.agent_id ? primary.get(node.agent_id) ?? n.id : n.id;
      const ex = node.agent_id ? extras[node.agent_id] : undefined;
      // Helper agents by name (ids → your agents).
      const withNames = ex && { ...ex, helpers: (ex.helpers ?? []).map((id) => myAgents.find((a) => a.id === id)?.name).filter((x): x is string => !!x) };
      // Adding a part shows the parts again, so the new one can be seen.
      Object.assign(data, { subs: subsOf(home, plainNodes, edges), shared: home !== n.id, onAdd: (port: Port) => { showParts(false); addSub(n.id, port); }, extras: withNames });
    }
    if (isSub(node)) data.labels = labels;
    return { ...n, selected: n.id === selectedId, hidden: partsHidden && isSub(node), data };
  }), [nodes, plainNodes, edges, trace, selectedId, addSub, labels, extras, primary, myAgents, partsHidden, showParts]);

  const shownEdges = useMemo(() => {
    const byId = new Map(plainNodes.map((n) => [n.id, n]));
    const name = (id: string) => { const n = byId.get(id); return n ? (n.type === "agent" ? n.label || n.agent.name : ("label" in n && n.label) || n.type) : id; };
    return edges.map((e) => {
      if (e.targetHandle && e.targetHandle !== "in") return partsHidden ? { ...e, hidden: true } : e;
      const taken = traceList.length > 0 && edgeTaken(e, traceOrder, trace);
      const text = taken ? passed.get(e.source) ?? "" : "";
      const data: DataEdgeData = {
        branch: branchLabel(e.sourceHandle, byId.get(e.source) as FlowNode | undefined),
        taken,
        skipped: traceList.length > 0 && !taken && traceOrder.has(e.source) && trace.get(e.source)?.status !== "running",
        passed: text,
        onOpen: () => setPassedView({ title: `${name(e.source)} → ${name(e.target)}`, text }),
      };
      return { ...e, type: "data", label: undefined, data };
    });
  }, [edges, plainNodes, traceList, traceOrder, trace, passed, partsHidden]);

  const canvas = useMemo(() => toCanvas(nodes, edges), [nodes, edges]);
  const dirty = snapshot(name, description, deliver, canvas) !== saved;
  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  // What deleting nodes removes: an agent takes its plugged-in parts with it —
  // unless the same agent is still on the canvas, which then gets them.
  const planRemoval = (ids: Set<string>) => {
    const moveTo = new Map<string, string>();
    for (const id of ids) {
      const n = plainNodes.find((x) => x.id === id);
      if (n?.type !== "agent" || !n.agent_id) continue;
      const heir = plainNodes.find((x) => x.type === "agent" && x.agent_id === n.agent_id && !ids.has(x.id));
      if (heir) moveTo.set(id, heir.id);
    }
    for (const e of edges) if (ids.has(e.target) && !moveTo.has(e.target) && e.targetHandle && e.targetHandle !== "in") ids.add(e.source);
    const nextEdges = (es: Edge[]) => es
      .map((e) => (moveTo.has(e.target) && e.targetHandle && e.targetHandle !== "in" ? toEdge({ id: `${e.source}-${moveTo.get(e.target)}`, from: e.source, to: moveTo.get(e.target)!, port: e.targetHandle as Port }) : e))
      .filter((e) => !ids.has(e.source) && !ids.has(e.target));
    return { ids, nextEdges };
  };

  const removeNodes = (ids: Set<string>) => {
    const plan = planRemoval(ids);
    setNodes((ns) => ns.filter((n) => !plan.ids.has(n.id)));
    setEdges(plan.nextEdges);
    if (selectedId && plan.ids.has(selectedId)) setSelectedId(null);
  };

  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    const removed = new Set(changes.flatMap((c) => (c.type === "remove" ? [c.id] : [])));
    if (removed.size) {
      const plan = planRemoval(removed);
      setEdges(plan.nextEdges);
      setNodes((ns) => applyNodeChanges(changes, ns).filter((n) => !plan.ids.has(n.id)));
      if (selectedId && plan.ids.has(selectedId)) setSelectedId(null);
      return;
    }
    setNodes((ns) => applyNodeChanges(changes, ns));
  }, [edges, selectedId, plainNodes]); // eslint-disable-line react-hooks/exhaustive-deps
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((es) => applyEdgeChanges(changes, es)), []);

  const isValidConnection = useCallback((c: Connection | Edge) => {
    if (c.source === c.target) return false;
    const src = nodes.find((n) => n.id === c.source)?.data.node;
    const dst = nodes.find((n) => n.id === c.target)?.data.node;
    if (!src || !dst) return false;
    const port = c.targetHandle && c.targetHandle !== "in" ? (c.targetHandle as Port) : null;
    if (port) {
      // Sub-nodes go into the matching port; one model per agent.
      if (!isSub(src) || dst.type !== "agent" || SUB_PORT[src.type] !== port) return false;
      const home = dst.agent_id ? primary.get(dst.agent_id) ?? dst.id : dst.id;
      if (port === "model") return !edges.some((e) => e.target === home && e.targetHandle === "model" && e.source !== src.id);
      return true;
    }
    return !isSub(src) && !isSub(dst) && dst.type !== "trigger";
  }, [nodes, edges, primary]);

  const onConnect = useCallback((c: Connection) => {
    const port = c.targetHandle && c.targetHandle !== "in" ? (c.targetHandle as Port) : null;
    // A part plugged into a repeated agent goes to its primary node.
    const dst = nodes.find((n) => n.id === c.target)?.data.node;
    const target = port && dst?.type === "agent" && dst.agent_id ? primary.get(dst.agent_id) ?? c.target : c.target;
    setEdges((es) => {
      if (port) {
        // A sub-node plugs into one agent: re-plugging moves it.
        return addEdge(toEdge({ id: `${c.source}-${target}`, from: c.source, to: target, port }), es.filter((e) => e.source !== c.source));
      }
      // One connection per output: a new one replaces the old — except
      // agent → agent, which adds one: agents on the same output run side by side.
      const branch = (c.sourceHandle ?? undefined) as never;
      const same = (e: Edge) => e.source === c.source && (e.sourceHandle ?? null) === (c.sourceHandle ?? null) && (!e.targetHandle || e.targetHandle === "in");
      const isAgent = (id: string) => nodes.find((n) => n.id === id)?.data.node.type === "agent";
      const fanOut = isAgent(c.target) && es.filter(same).every((e) => isAgent(e.target));
      return addEdge(
        toEdge({ id: `${c.source}-${c.sourceHandle ?? "out"}-${c.target}`, from: c.source, to: c.target, branch }),
        fanOut ? es : es.filter((e) => !same(e)),
      );
    });
  }, [nodes, primary]);

  const addStep = (type: StudioNodeType) => {
    const main = nodes.filter((n) => !isSub(n.data.node));
    const anchor = selected && !isSub(selected.data.node) ? selected : main.reduce<CanvasNode | null>((r, n) => (!r || n.position.x > r.position.x ? n : r), null);
    const position = anchor ? { x: anchor.position.x + 300, y: anchor.position.y + (selected ? 0 : 40) } : { x: 0, y: 0 };
    let node = newStudioNode(type, position);
    if (node.type === "agent") node = { ...node, agent: { ...node.agent, name: uniqueAgentName(plainNodes) } };
    setNodes((ns) => [...ns, { id: node.id, type: kindOf(node), position, data: { node }, deletable: true }]);
    setSelectedId(node.id);
    openPanel();
  };

  // Existing agents already on the canvas (they may appear again).
  const usedAgentIds = new Set(plainNodes.flatMap((n) => (n.type === "agent" && n.agent_id ? [n.agent_id] : [])));

  // Turns an agent node into an existing agent: its settings and its
  // model/tools/knowledge/skills (so saving doesn't change the agent).
  const applyExistingAgent = (nodeId: string, a: AgentSummary | null) => {
    const target = nodes.find((n) => n.id === nodeId);
    if (!target || target.data.node.type !== "agent") return;
    if (!a) {
      // Detach: saving creates a new agent from these settings instead.
      const others = plainNodes.filter((n) => n.id !== nodeId);
      updateNode({ ...target.data.node, agent_id: null, agent: { ...target.data.node.agent, name: uniqueAgentName(others, `${target.data.node.agent.name} copy`) } });
      return;
    }
    const oldSubs = new Set(subsOf(nodeId, plainNodes, edges).map((s) => s.id));
    // Already elsewhere on the canvas: share that occurrence's parts.
    const repeat = plainNodes.some((n) => n.id !== nodeId && n.type === "agent" && n.agent_id === a.id);
    const subs = repeat ? { nodes: [], edges: [] } : subsFromAgent(a, target.position, nodeId);
    const agentNode: StudioNode = { ...target.data.node, agent_id: a.id, label: undefined, agent: { name: a.name, icon: a.icon || "🤖", description: a.description ?? "", instructions: a.instructions ?? "" } };
    setNodes((ns) => [
      ...ns.filter((n) => !oldSubs.has(n.id)).map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, node: agentNode } } : n)),
      ...subs.nodes.map((sn) => ({ id: sn.id, type: "sub", position: sn.position, data: { node: sn }, deletable: true })),
    ]);
    setEdges((es) => [...es.filter((e) => !oldSubs.has(e.source)), ...subs.edges.map(toEdge)]);
  };

  // "My agents" in the toolbar: a new node that is that agent.
  const addExistingAgent = (a: AgentSummary) => {
    setAgentMenu(false);
    const main = nodes.filter((n) => !isSub(n.data.node));
    const anchor = selected && !isSub(selected.data.node) ? selected : main.reduce<CanvasNode | null>((r, n) => (!r || n.position.x > r.position.x ? n : r), null);
    const position = anchor ? { x: anchor.position.x + 300, y: anchor.position.y + (selected ? 0 : 40) } : { x: 0, y: 0 };
    const base = newStudioNode("agent", position);
    if (base.type !== "agent") return;
    const existing = plainNodes.find((n): n is Extract<StudioNode, { type: "agent" }> => n.type === "agent" && n.agent_id === a.id);
    // A repeat shares the first occurrence's settings and parts; only its task is its own.
    const node: StudioNode = { ...base, agent_id: a.id, agent: existing ? { ...existing.agent } : { name: a.name, icon: a.icon || "🤖", description: a.description ?? "", instructions: a.instructions ?? "" } };
    const subs = existing ? { nodes: [], edges: [] } : subsFromAgent(a, position, node.id);
    setNodes((ns) => [...ns, { id: node.id, type: "agent", position, data: { node }, deletable: true },
      ...subs.nodes.map((sn) => ({ id: sn.id, type: "sub", position: sn.position, data: { node: sn }, deletable: true }))]);
    setEdges((es) => [...es, ...subs.edges.map(toEdge)]);
    setSelectedId(node.id);
    openPanel();
  };

  const updateNode = (node: StudioNode) => {
    setNodes((ns) => ns.map((n) => {
      if (n.id === node.id) return { ...n, data: { ...n.data, node } };
      // The same agent elsewhere on the canvas gets the same settings (its task stays its own).
      const other = n.data.node;
      if (node.type === "agent" && node.agent_id && other.type === "agent" && other.agent_id === node.agent_id) {
        return { ...n, data: { ...n.data, node: { ...other, agent: { ...node.agent } } } };
      }
      return n;
    }));
    if (node.type === "router") {
      const live = new Set(node.routes.map((r) => `route:${r.id}`));
      setEdges((es) => es.filter((e) => e.source !== node.id || !e.sourceHandle?.startsWith("route:") || live.has(e.sourceHandle)));
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const input = { name, description, deliver_result: deliver, canvas };
      if (isNew) {
        const created = await studioApi.create(input);
        setSelectedId(null);      // show the Run panel: running is the next step
        navigate(`/studio/${created.id}`, { replace: true });
        return;
      }
      showProject(await studioApi.update(routeId!, input));
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (e) {
      setError(errorText(e, "Couldn't save"));
    } finally {
      setSaving(false);
    }
  };

  const run = async (input: string) => {
    if (!routeId) return;
    setStarting(true);
    setError(null);
    try {
      const r = await studioApi.run(routeId, input);
      setActive(r);
      setRuns((list) => [r, ...list]);
      setSelectedId(null);
    } catch (e) {
      setError(errorText(e, "Couldn't start the run"));
    } finally {
      setStarting(false);
    }
  };

  const refreshActive = async () => {
    if (!active) return;
    const r = await pipelinesApi.getRun(active.id);
    setActive(r);
    setRuns((list) => list.map((x) => (x.id === r.id ? r : x)));
  };

  const rotateWebhook = async () => {
    if (!routeId) return;
    setRotating(true);
    try {
      const p = await studioApi.rotateWebhook(routeId);
      setProject(p);
    } catch (e) {
      setError(errorText(e, "Couldn't create a new URL"));
    } finally {
      setRotating(false);
    }
  };

  if (loadError) {
    return (
      <div className="ag_page">
        <div className="ag_error">{loadError}</div>
        <Button onClick={() => navigate("/studio")}><ArrowLeft size={15} /> Back to Agent Studio</Button>
      </div>
    );
  }

  const blockedReason = isNew ? "Save the project first." : dirty ? "Save your changes first." : undefined;
  const selNode = selected?.data.node ?? null;
  const hostAgent = selNode && isSub(selNode) ? plainNodes.find((n) => edges.some((e) => e.source === selNode.id && e.target === n.id)) ?? null : null;
  const savedTrigger = project ? (project.canvas.nodes.find((n) => n.type === "trigger") as Extract<StudioNode, { type: "trigger" }> | undefined)?.trigger.type ?? null : null;

  return (
    <div className={`ag_page ag_page--editor wf_page as_page ${layout.focus ? "is_focus" : ""}`}>
      <header className="ag_editor_head">
        <button type="button" className="ag_back" onClick={() => navigate("/studio")}><ArrowLeft size={16} /> Agent Studio</button>
        <div className="ag_editor_head__title">
          <h1>{isNew ? "New project" : name || "Untitled project"}</h1>
          {project && <span className="ag_chip">{project.trigger_summary}</span>}
        </div>
      </header>

      <div className="wf_meta">
        <input className="ag_input ag_input--title" value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" maxLength={80} />
        <input className="ag_input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does it do? (optional)" maxLength={300} />
      </div>

      <div className={`wf_layout ${layout.panel ? "" : "is_panel_closed"}`}>
        <div className="wf_canvas as_canvas">
          <CanvasViewbar focus={layout.focus} onFocus={layout.toggleFocus} panel={layout.panel} onPanel={layout.togglePanel}
            parts={{ hidden: partsHidden, onToggle: () => {
              // A hidden part can't stay selected.
              if (!partsHidden && selected && isSub(selected.data.node)) setSelectedId(null);
              showParts(!partsHidden);
            } }} />
          <div className="wf_toolbar" role="toolbar" aria-label="Add a node">
            <div className="as_agentmenu">
              <button type="button" className="wf_add" onClick={() => setAgentMenu((v) => !v)} aria-expanded={agentMenu} aria-haspopup="menu">
                <Bot size={15} /> My agents
              </button>
              {agentMenu && (
                <div className="as_agentmenu__list" role="menu">
                  {myAgents.length === 0 && <span className="ag_muted ag_small">You have no agents yet.</span>}
                  {myAgents.map((a) => (
                    <button key={a.id} type="button" role="menuitem" onClick={() => addExistingAgent(a)}>
                      <span className="as_agentmenu__icon">{a.icon || "🤖"}</span>
                      <span className="as_agentmenu__text">
                        <strong>{a.name}</strong>
                        <span>{usedAgentIds.has(a.id) ? "Already in this project — add again with its own task" : a.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {ADD.map((a) => (
              <button key={a.type} type="button" className={`wf_add wf_add--${a.type}`} onClick={() => addStep(a.type)}>{a.icon} {a.label}</button>
            ))}
          </div>
          {ready && <ReactFlow
            nodes={shown}
            edges={shownEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onNodeClick={(_e, n) => { setSelectedId(n.id); layout.openPanel(); }}
            onPaneClick={() => setSelectedId(null)}
            deleteKeyCode={["Backspace", "Delete"]}
            fitView
            fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
            minZoom={0.25}
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="as_minimap" />
          </ReactFlow>}
          <div className="as_hint ag_small">Drag from a node's right dot to connect · <strong>+</strong> on an agent adds a model, tool, knowledge or skill</div>
        </div>

        <aside className="wf_side">
          {selected && selNode ? (
            <StudioInspector
              key={selected.id}
              node={selNode}
              before={upstream(selected.id, nodes, edges)}
              subs={(() => {
                const n = selected.data.node;
                const home = n.type === "agent" && n.agent_id ? primary.get(n.agent_id) ?? selected.id : selected.id;
                return subsOf(home, plainNodes, edges);
              })()}
              hostAgent={hostAgent}
              runEntry={trace.get(selected.id)}
              sample={(() => {
                // What reached this step in the shown run; else the previous
                // agent's answer from its own test; else the run's input.
                const into = edges.find((e) => e.target === selected.id && (!e.targetHandle || e.targetHandle === "in") && edgeTaken(e, traceOrder, trace));
                if (into) return passed.get(into.source) ?? "";
                const from = edges.find((e) => e.target === selected.id && (!e.targetHandle || e.targetHandle === "in"));
                if (from && testOutputs[from.source]) return testOutputs[from.source];
                return active?.input ?? "";
              })()}
              onTested={(output) => setTestOutputs((t) => ({ ...t, [selected.id]: output }))}
              repeatOf={(() => {
                const n = selected.data.node;
                if (n.type !== "agent" || !n.agent_id) return null;
                const home = primary.get(n.agent_id);
                return home && home !== selected.id ? home : null;
              })()}
              ctx={{ catalog, documents, skills, project, savedTrigger, deliver, setDeliver, onRotateWebhook: () => void rotateWebhook(), rotating,
                agents: myAgents, usedAgentIds, onUseAgent: (a) => applyExistingAgent(selected.id, a),
                extras: selNode.type === "agent" && selNode.agent_id ? extras[selNode.agent_id] : undefined }}
              onChange={updateNode}
              onDelete={() => removeNodes(new Set([selected.id]))}
              onClose={() => setSelectedId(null)}
              onSelect={setSelectedId}
              onAddSub={(port) => addSub(selected.id, port)}
            />
          ) : (
            <FlowRunPanel
              canRun={!blockedReason && active?.status !== "running"}
              blockedReason={blockedReason}
              starting={starting}
              onRun={(input) => void run(input)}
              save={blockedReason ? {
                label: isNew ? "Create project" : "Save changes",
                onSave: () => void save(),
                busy: saving,
                disabled: !name.trim(),
                hint: !name.trim() ? "Give the project a name, then save it." : isNew ? "Save the project first — this creates its agents." : "Save your changes first.",
              } : undefined}
              active={active}
              runs={runs}
              onPick={setActive}
              onDecide={async (approved, comment) => {
                if (!active) return;
                setError(null);
                try {
                  await pipelinesApi.decide(active.id, approved, comment);
                } catch (e) {
                  setError(errorText(e, "Couldn't record the decision"));
                }
                await refreshActive().catch(() => {});
              }}
              onCancel={async () => {
                if (!active) return;
                await pipelinesApi.cancel(active.id).catch((e) => setError(errorText(e, "Couldn't cancel")));
                await refreshActive().catch(() => {});
              }}
            />
          )}
        </aside>
      </div>

      {passedView && (
        <Modal title={passedView.title} subtitle="The text handed to the next step in this run." onClose={() => setPassedView(null)} wide>
          {passedView.text ? <MarkdownOutput text={passedView.text} tall /> : <p className="ag_muted">(empty)</p>}
        </Modal>
      )}

      <div className={`ag_savebar ${dirty || isNew || error ? "is_visible" : ""}`}>
        <ErrorNote message={error} />
        <span className="ag_muted ag_small">{isNew ? "Build the project, then create it — its agents are created too." : justSaved ? "Saved" : dirty ? "You have unsaved changes" : ""}</span>
        <Button variant="primary" onClick={() => void save()} busy={saving} disabled={!name.trim() || (!isNew && !dirty)}>
          {justSaved ? <><Check size={15} /> Saved</> : isNew ? "Create project" : "Save changes"}
        </Button>
      </div>
    </div>
  );
};
