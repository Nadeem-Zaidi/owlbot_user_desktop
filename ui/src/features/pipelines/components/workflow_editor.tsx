import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addEdge, applyEdgeChanges, applyNodeChanges, Background, Controls, ReactFlow,
  type Connection, type Edge, type EdgeChange, type NodeChange,
} from "@xyflow/react";
import { ArrowLeft, Bell, Bot, Check, Columns3, Flag, GitFork, Info, Route as RouteIcon, ShieldCheck } from "lucide-react";
import { Button, ErrorNote } from "@/shared/ui/ui";
import { loadStepAgents, stepKey, type StepAgent } from "@/features/pipelines/api/pipeline_agents";
import { pipelinesApi, type Flow, type FlowNode, type NodeType, type PipelineRun } from "@/features/pipelines/api/pipelines_api";
import { branchLabel, isTrace, newNode, starterFlow, statusByNode, toEdge, toFlow, toGraph, upstream, type StepNode } from "@/features/pipelines/lib/flow_graph";
import { StepNodeCard } from "@/features/pipelines/components/flow_nodes";
import { FlowInspector } from "@/features/pipelines/components/flow_inspector";
import { FlowRunPanel } from "@/features/pipelines/components/flow_run_panel";
import { CanvasViewbar } from "@/features/pipelines/components/canvas_viewbar";
import { NewAgentDialog } from "@/features/pipelines/components/new_agent_dialog";
import { useCanvasLayout } from "@/features/pipelines/lib/use_canvas_layout";

const nodeTypes = { step: StepNodeCard };
const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

const ADD: { type: NodeType; label: string; icon: React.ReactNode }[] = [
  { type: "agent", label: "Agent", icon: <Bot size={15} /> },
  { type: "parallel", label: "Parallel", icon: <Columns3 size={15} /> },
  { type: "condition", label: "Condition", icon: <GitFork size={15} /> },
  { type: "router", label: "Router", icon: <RouteIcon size={15} /> },
  { type: "approval", label: "Approval", icon: <ShieldCheck size={15} /> },
  { type: "notify", label: "Notify", icon: <Bell size={15} /> },
  { type: "end", label: "End", icon: <Flag size={15} /> },
];

// Visual workflow editor: steps on a canvas, connected by drag; conditions
// and approvals branch. The side panel edits the selected step, or runs the
// workflow (with live step status on the canvas) when nothing is selected.
export const WorkflowEditor = () => {
  const { id: routeId } = useParams();
  const isNew = !routeId;
  const navigate = useNavigate();

  const [agents, setAgents] = useState<StepAgent[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nodes, setNodes] = useState<StepNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [saved, setSaved] = useState("");
  const [wasLinear, setWasLinear] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [active, setActive] = useState<PipelineRun | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [starting, setStarting] = useState(false);
  // "New agent" dialog for this agent step.
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const layout = useCanvasLayout("owl.workflow");

  const snapshot = (n: string, d: string, flow: Flow) => JSON.stringify({ n, d, flow });

  useEffect(() => {
    (async () => {
      try {
        const list = await loadStepAgents();
        setAgents(list);
        if (isNew) {
          const g = toGraph(starterFlow(list.find((a) => a.active)));
          setNodes(g.nodes);
          setEdges(g.edges);
          return;
        }
        const d = await pipelinesApi.getPipeline(routeId!);
        const g = toGraph(d.flow);
        setName(d.name);
        setDescription(d.description);
        setNodes(g.nodes);
        setEdges(g.edges);
        setWasLinear(!d.is_workflow);
        setSaved(snapshot(d.name, d.description, toFlow(g.nodes, g.edges)));
        setRuns(d.runs);
        setActive(d.runs[0] ?? null);
      } catch (e) {
        setLoadError(errorText(e, "Couldn't load the workflow"));
      }
    })();
  }, [isNew, routeId]);

  // Follow the active run: quickly while it runs, slowly while it waits for
  // an approval (which may come from another device).
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

  const agentByKey = useMemo(() => new Map(agents.map((a) => [stepKey({ kind: a.kind, agent_id: a.id }), a])), [agents]);
  const status = useMemo(() => statusByNode(active && isTrace(active.steps) ? (active.steps as never) : undefined), [active]);
  const shown = useMemo(() => nodes.map((n) => {
    const node = n.data.node;
    const agent = node.type === "agent" ? agentByKey.get(stepKey({ kind: node.agent_kind, agent_id: node.agent_id })) : undefined;
    const branchAgents = node.type === "parallel" ? node.branches.map((b) => agentByKey.get(stepKey({ kind: b.agent_kind, agent_id: b.agent_id }))) : undefined;
    return { ...n, selected: n.id === selectedId, data: { ...n.data, agent, branchAgents, status: status.get(n.id) } };
  }), [nodes, agentByKey, status, selectedId]);

  // Edge labels follow the current route names.
  const shownEdges = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n.data.node]));
    return edges.map((e) => ({ ...e, label: branchLabel(e.sourceHandle, byId.get(e.source)) }));
  }, [nodes, edges]);

  const flow = useMemo(() => toFlow(nodes, edges), [nodes, edges]);
  const dirty = snapshot(name, description, flow) !== saved;
  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  const onNodesChange = useCallback((changes: NodeChange<StepNode>[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
    if (changes.some((c) => c.type === "remove")) setEdges((es) => es.filter((e) => !changes.some((c) => c.type === "remove" && (c.id === e.source || c.id === e.target))));
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((es) => applyEdgeChanges(changes, es)), []);
  // One connection per output: a new one replaces the old.
  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge(
    toEdge({ id: `${c.source}-${c.sourceHandle ?? "out"}-${c.target}`, from: c.source, to: c.target, branch: (c.sourceHandle ?? undefined) as never }),
    es.filter((e) => !(e.source === c.source && (e.sourceHandle ?? null) === (c.sourceHandle ?? null))),
  )), []);
  const isValidConnection = useCallback((c: Connection | Edge) => {
    if (c.source === c.target) return false;
    const target = nodes.find((n) => n.id === c.target)?.data.node.type;
    return target !== "start";
  }, [nodes]);

  const addStep = (type: NodeType) => {
    const anchor = selected ?? nodes.reduce<StepNode | null>((low, n) => (!low || n.position.y > low.position.y ? n : low), null);
    const position = anchor ? { x: anchor.position.x + (selected ? 0 : 40), y: anchor.position.y + 150 } : { x: 0, y: 0 };
    const node = newNode(type, position, agents.find((a) => a.active), agents.filter((a) => a.active));
    setNodes((ns) => [...ns, { id: node.id, type: "step", position, data: { node }, deletable: true }]);
    setSelectedId(node.id);
    layout.openPanel();
    // No agent to pick yet: create one right away.
    if (type === "agent" && !agents.some((a) => a.active)) setCreatingFor(node.id);
  };

  const attachNewAgent = (agent: StepAgent) => {
    setAgents((list) => [...list, agent]);
    setNodes((ns) => ns.map((n) => (n.id === creatingFor && n.data.node.type === "agent"
      ? { ...n, data: { ...n.data, node: { ...n.data.node, agent_kind: "agent", agent_id: agent.id } } }
      : n)));
    setCreatingFor(null);
  };
  const updateNode = (node: FlowNode) => {
    setNodes((ns) => ns.map((n) => (n.id === node.id ? { ...n, data: { ...n.data, node } } : n)));
    // A deleted route takes its connection with it.
    if (node.type === "router") {
      const live = new Set(node.routes.map((r) => `route:${r.id}`));
      setEdges((es) => es.filter((e) => e.source !== node.id || !e.sourceHandle?.startsWith("route:") || live.has(e.sourceHandle)));
    }
  };
  const deleteNode = (id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setSelectedId(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const input = { name, description, flow };
      if (isNew) {
        const created = await pipelinesApi.createWorkflow(input);
        navigate(`/pipelines/${created.id}/flow`, { replace: true });
        return;
      }
      await pipelinesApi.updateWorkflow(routeId!, input);
      setSaved(snapshot(name, description, flow));
      setWasLinear(false);
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
      const r = await pipelinesApi.run(routeId, input);
      setActive(r);
      setRuns((list) => [r, ...list]);
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

  if (loadError) {
    return (
      <div className="ag_page">
        <div className="ag_error">{loadError}</div>
        <Button onClick={() => navigate("/pipelines")}><ArrowLeft size={15} /> Back to workflows</Button>
      </div>
    );
  }

  const blockedReason = isNew ? "Create the workflow first." : dirty ? "Save your changes first." : undefined;

  return (
    <div className={`ag_page ag_page--editor wf_page ${layout.focus ? "is_focus" : ""}`}>
      <header className="ag_editor_head">
        <button type="button" className="ag_back" onClick={() => navigate("/pipelines")}><ArrowLeft size={16} /> Workflows</button>
        <div className="ag_editor_head__title">
          <h1>{isNew ? "New workflow" : name || "Untitled workflow"}</h1>
        </div>
      </header>

      <div className="wf_meta">
        <input className="ag_input ag_input--title" value={name} onChange={(e) => setName(e.target.value)} placeholder="Workflow name" maxLength={80} />
        <input className="ag_input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does it do? (optional)" maxLength={300} />
      </div>
      {wasLinear && (
        <div className="wf_note"><Info size={14} /> This pipeline now opens as a workflow. Add conditions or approvals; saving converts it (its runs stay).</div>
      )}

      <div className={`wf_layout ${layout.panel ? "" : "is_panel_closed"}`}>
        <div className="wf_canvas">
          <CanvasViewbar focus={layout.focus} onFocus={layout.toggleFocus} panel={layout.panel} onPanel={layout.togglePanel} />
          <div className="wf_toolbar" role="toolbar" aria-label="Add a step">
            {ADD.map((a) => (
              <button key={a.type} type="button" className={`wf_add wf_add--${a.type}`} onClick={() => addStep(a.type)}>
                {a.icon} {a.label}
              </button>
            ))}
          </div>
          <ReactFlow
            nodes={shown}
            edges={shownEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onNodeClick={(_e, n) => { setSelectedId(n.id); layout.openPanel(); }}
            onPaneClick={() => setSelectedId(null)}
            deleteKeyCode={["Backspace", "Delete"]}
            fitView
            fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
            minZoom={0.3}
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <aside className="wf_side">
          {selected ? (
            <FlowInspector
              key={selected.id}
              node={selected.data.node}
              agents={agents}
              before={upstream(selected.id, nodes, edges)}
              onChange={updateNode}
              onDelete={() => deleteNode(selected.id)}
              onClose={() => setSelectedId(null)}
              onCreateAgent={() => setCreatingFor(selected.id)}
            />
          ) : (
            <FlowRunPanel
              canRun={!blockedReason && active?.status !== "running"}
              blockedReason={blockedReason}
              starting={starting}
              onRun={(input) => void run(input)}
              save={blockedReason ? {
                label: isNew ? "Create workflow" : "Save changes",
                onSave: () => void save(),
                busy: saving,
                disabled: !name.trim(),
                hint: !name.trim() ? "Give the workflow a name, then save it." : undefined,
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

      {creatingFor && <NewAgentDialog onClose={() => setCreatingFor(null)} onCreated={attachNewAgent} />}

      <div className={`ag_savebar ${dirty || isNew ? "is_visible" : ""}`}>
        <ErrorNote message={error} />
        <span className="ag_muted ag_small">{isNew ? "Build the flow, then create it." : justSaved ? "Saved" : "You have unsaved changes"}</span>
        <Button variant="primary" onClick={() => void save()} busy={saving} disabled={!name.trim() || (!isNew && !dirty)}>
          {justSaved ? <><Check size={15} /> Saved</> : isNew ? "Create workflow" : "Save changes"}
        </Button>
      </div>
    </div>
  );
};
