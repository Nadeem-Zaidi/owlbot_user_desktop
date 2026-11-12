import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Bot, Cloud, GitBranch, GitFork, MoreHorizontal, PauseCircle, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { loadStepAgents, stepKey, type StepAgent } from "@/features/pipelines/api/pipeline_agents";
import { pipelinesApi, type PipelineSummary, type WaitingRun } from "@/features/pipelines/api/pipelines_api";
import { AgentAvatar } from "@/shared/ui/agent_avatar";
import { Button, ConfirmDialog } from "@/shared/ui/ui";

// Switch between the agents gallery and pipelines.
export const AgentsNav = ({ active }: { active: "agents" | "pipelines" | "native" }) => {
  const navigate = useNavigate();
  return (
    <div className="ag_segmented ag_topnav" role="tablist">
      <button type="button" role="tab" aria-selected={active === "agents"} className={active === "agents" ? "is_active" : ""} onClick={() => navigate("/agents")}><Bot size={14} /> Agents</button>
      <button type="button" role="tab" aria-selected={active === "pipelines"} className={active === "pipelines" ? "is_active" : ""} onClick={() => navigate("/pipelines")}><GitBranch size={14} /> Pipelines</button>
      <button type="button" role="tab" aria-selected={active === "native"} className={active === "native" ? "is_active" : ""} onClick={() => navigate("/native-agents")}><Cloud size={14} /> Provider agents</button>
    </div>
  );
};

export const PipelinesPage = () => {
  const navigate = useNavigate();
  const [pipelines, setPipelines] = useState<PipelineSummary[] | null>(null);
  const [agents, setAgents] = useState<StepAgent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PipelineSummary | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([pipelinesApi.list(), loadStepAgents()])
      .then(([p, a]) => { setPipelines(p); setAgents(a); })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuFor]);

  const byKey = useMemo(() => new Map(agents.map((a) => [stepKey({ kind: a.kind, agent_id: a.id }), a])), [agents]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await pipelinesApi.remove(deleting.id);
      setPipelines((list) => (list ?? []).filter((p) => p.id !== deleting.id));
      setDeleting(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ag_page">
      <AgentsNav active="pipelines" />
      <header className="ag_page__header">
        <div>
          <h1 className="ag_page__title">Workflows</h1>
          <p className="ag_page__subtitle">Chain agents — with conditions, branches and approvals in the visual editor, or as a simple pipeline where each step's output feeds the next.</p>
        </div>
        <div className="wf_head_actions">
          <Button onClick={() => navigate("/pipelines/new")} disabled={agents.length === 0} title={agents.length === 0 ? "Create an agent first" : undefined}>
            <Plus size={16} /> Simple pipeline
          </Button>
          <Button variant="primary" onClick={() => navigate("/pipelines/new-workflow")}>
            <GitFork size={16} /> New workflow
          </Button>
        </div>
      </header>

      <ApprovalsInbox onOpen={(pipelineId) => navigate(`/pipelines/${pipelineId}/flow`)} />

      {error && <div className="ag_error">{error}</div>}
      {pipelines === null && !error && <div className="ag_grid">{[0, 1].map((i) => <div key={i} className="ag_card ag_card--skeleton" />)}</div>}

      {pipelines?.length === 0 && (
        <div className="ag_empty">
          <span className="ag_empty__icon"><GitBranch size={22} /></span>
          <h2>No pipelines yet</h2>
          <p>
            {agents.length === 0
              ? "Create at least one agent first, then chain agents here."
              : "Example: a “Researcher” agent gathers facts → a “Writer” agent turns them into a report → a “Reviewer” agent checks it."}
          </p>
          {agents.length > 0 ? <Button variant="primary" onClick={() => navigate("/pipelines/new")}><Plus size={16} /> New pipeline</Button>
            : <Button variant="primary" onClick={() => navigate("/agents/new")}><Plus size={16} /> New agent</Button>}
        </div>
      )}

      {!!pipelines?.length && (
        <div className="ag_grid">
          {pipelines.map((p) => (
            <article key={p.id} className="ag_card" onDoubleClick={() => navigate(p.flow ? `/pipelines/${p.id}/flow` : `/pipelines/${p.id}`)}>
              <div className="ag_card__top">
                <div className="pl_chain">
                  {p.steps.map((s, i) => {
                    const a = byKey.get(stepKey(s));
                    return (
                      <span key={i} className="pl_chain__item">
                        {i > 0 && <ArrowRight size={13} className="pl_chain__arrow" />}
                        <span className="pl_chain__icon" title={a?.name ?? "Deleted agent"}>{a ? <AgentAvatar icon={a.icon} /> : "❔"}</span>
                      </span>
                    );
                  })}
                </div>
                <div className="ag_card__menu_wrap">
                  <button type="button" className="ag_icon_btn" aria-label={`More actions for ${p.name}`} onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === p.id ? null : p.id); }}>
                    <MoreHorizontal size={18} />
                  </button>
                  {menuFor === p.id && (
                    <div className="ag_menu" role="menu">
                      <button type="button" role="menuitem" onClick={() => navigate(p.flow ? `/pipelines/${p.id}/flow` : `/pipelines/${p.id}`)}><Pencil size={14} /> Edit</button>
                      <button type="button" role="menuitem" className="is_danger" onClick={() => setDeleting(p)}><Trash2 size={14} /> Delete</button>
                    </div>
                  )}
                </div>
              </div>
              <h3 className="ag_card__name">{p.name}</h3>
              <p className="ag_card__desc">{p.description || p.steps.map((s) => byKey.get(stepKey(s))?.name ?? "Deleted agent").join(" → ")}</p>
              <div className="ag_card__chips">
                {p.flow && <span className="ag_chip ag_chip--accent"><GitFork size={12} /> Workflow</span>}
                <span className="ag_chip">{p.flow ? `${p.flow.nodes.length} steps` : `${p.steps.length} step${p.steps.length === 1 ? "" : "s"}`}</span>
                {p.last_run_status && <span className={`ag_status ag_status--${p.last_run_status}`}>{p.last_run_status === "succeeded" ? "Last run OK" : p.last_run_status === "waiting" ? "Waiting for approval" : p.last_run_status === "running" ? "Running" : `Last run ${p.last_run_status}`}</span>}
              </div>
              <div className="ag_card__footer">
                <span />
                <div className="ag_card__actions">
                  <Button variant="primary" onClick={() => navigate(p.flow ? `/pipelines/${p.id}/flow` : `/pipelines/${p.id}`)}><Play size={14} /> Open</Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.name}”?`}
          message="Its run history is deleted too. The agents themselves aren't affected."
          confirmLabel="Delete pipeline"
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
};

// Runs paused at an approval step, across all workflows.
const ApprovalsInbox = ({ onOpen }: { onOpen: (pipelineId: string) => void }) => {
  const [runs, setRuns] = useState<WaitingRun[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => pipelinesApi.approvals().then((r) => { if (alive) setRuns(r); }).catch(() => {});
    void load();
    const t = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!runs.length) return null;
  return (
    <section className="wf_inbox" aria-label="Waiting for your approval">
      <strong><PauseCircle size={15} /> Waiting for your approval</strong>
      {runs.map((r) => {
        const waiting = (r.steps as unknown as { status: string; label: string; output?: string }[]).filter((s) => s.status === "waiting").pop();
        return (
          <button key={r.id} type="button" className="wf_inbox__item" onClick={() => onOpen(r.pipeline_id)}>
            <span className="wf_inbox__name">{r.pipeline_name} · {waiting?.label ?? "Approval"}</span>
            <span className="ag_muted ag_small">{(waiting?.output ?? "").slice(0, 120)}</span>
          </button>
        );
      })}
    </section>
  );
};
