import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Clock, Download, MessageSquare, MoreHorizontal, Pencil, Play, Plus, Trash2, Upload, Webhook, Workflow } from "lucide-react";
import { AgentAvatar } from "@/shared/ui/agent_avatar";
import { Button, ConfirmDialog } from "@/shared/ui/ui";
import { studioApi, type StudioSummary, type TriggerType } from "@/features/studio/api/studio_api";
import { TEMPLATES } from "@/features/studio/lib/studio_templates";
import { downloadJson, portableApi } from "@/features/portable/api/portable_api";
import { ImportDialog } from "@/features/portable/components/import_dialog";

const TRIGGER_ICON: Record<TriggerType, React.ReactNode> = {
  manual: <Play size={12} />, schedule: <Clock size={12} />, webhook: <Webhook size={12} />, chat: <MessageSquare size={12} />,
};

const STATUS_TEXT: Record<string, string> = { succeeded: "Last run OK", waiting: "Waiting for approval", running: "Running" };

// Agent Studio home: your projects, plus a blank canvas and templates.
export const StudioPage = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<StudioSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<StudioSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const exportProject = async (p: StudioSummary) => {
    setMenuFor(null);
    try {
      downloadJson(await portableApi.exportProject(p.id), p.name);
      setNotice(`Exported “${p.name}” with its agents. Tokens and secret values aren't in the file — you add them when importing.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't export");
    }
  };

  useEffect(() => {
    studioApi.list().then(setProjects).catch((e) => setError(e instanceof Error ? e.message : "Couldn't load your projects"));
  }, []);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuFor]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const r = await studioApi.remove(deleting.id);
      setProjects((list) => (list ?? []).filter((p) => p.id !== deleting.id));
      setNotice(`Deleted “${deleting.name}”. Its ${r.agents_kept} agent${r.agents_kept === 1 ? " is" : "s are"} still on the Agents page.`);
      setDeleting(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ag_page">
      <header className="ag_page__header">
        <div>
          <h1 className="ag_page__title">Agent Studio</h1>
          <p className="ag_page__subtitle">Build agents visually: plug a model, tools, knowledge and skills into each one, chain them with routers and approvals, and start it all by hand, on a schedule, from a webhook or a chat command.</p>
        </div>
        <div className="pt_head_actions">
          <Button onClick={() => setImporting(true)}><Upload size={16} /> Import</Button>
          <Button variant="primary" onClick={() => navigate("/studio/new")}><Plus size={16} /> New project</Button>
        </div>
      </header>

      {error && <div className="ag_error">{error}</div>}
      {notice && <div className="mk_notice">{notice}</div>}

      <section className="ag_section">
        <h2 className="as_h2">Start from a template</h2>
        <div className="as_templates">
          <button type="button" className="as_template as_template--blank" onClick={() => navigate("/studio/new")}>
            <span className="as_template__icon"><Plus size={18} /></span>
            <strong>Blank project</strong>
            <span className="ag_muted ag_small">A trigger, one agent and an end.</span>
          </button>
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" className="as_template" onClick={() => navigate(`/studio/new?template=${t.id}`)}>
              <span className="as_template__icon">{t.icon}</span>
              <strong>{t.name}</strong>
              <span className="ag_muted ag_small">{t.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="ag_section">
        <h2 className="as_h2">Your projects</h2>
        {projects === null && !error && <div className="ag_grid">{[0, 1].map((i) => <div key={i} className="ag_card ag_card--skeleton" />)}</div>}
        {projects?.length === 0 && (
          <div className="ag_empty">
            <span className="ag_empty__icon"><Workflow size={22} /></span>
            <h2>No projects yet</h2>
            <p>Pick a template above, or start blank. The agents you build here are real agents — you'll also find them on the Agents page.</p>
          </div>
        )}
        {!!projects?.length && (
          <div className="ag_grid">
            {projects.map((p) => (
              <article key={p.id} className="ag_card" onDoubleClick={() => navigate(`/studio/${p.id}`)}>
                <div className="ag_card__top">
                  <div className="pl_chain">
                    {p.agents.slice(0, 6).map((a, i) => (
                      <span key={i} className="pl_chain__item">
                        {i > 0 && <ArrowRight size={13} className="pl_chain__arrow" />}
                        <span className="pl_chain__icon" title={a.name}><AgentAvatar icon={a.icon} /></span>
                      </span>
                    ))}
                    {p.agents.length > 6 && <span className="ag_muted ag_small">+{p.agents.length - 6}</span>}
                  </div>
                  <div className="ag_card__menu_wrap">
                    <button type="button" className="ag_icon_btn" aria-label={`More actions for ${p.name}`} onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === p.id ? null : p.id); }}>
                      <MoreHorizontal size={18} />
                    </button>
                    {menuFor === p.id && (
                      <div className="ag_menu" role="menu">
                        <button type="button" role="menuitem" onClick={() => navigate(`/studio/${p.id}`)}><Pencil size={14} /> Edit</button>
                        <button type="button" role="menuitem" onClick={() => void exportProject(p)}><Download size={14} /> Export JSON</button>
                        <button type="button" role="menuitem" className="is_danger" onClick={() => setDeleting(p)}><Trash2 size={14} /> Delete</button>
                      </div>
                    )}
                  </div>
                </div>
                <h3 className="ag_card__name">{p.name}</h3>
                <p className="ag_card__desc">{p.description || p.agents.map((a) => a.name).join(" → ")}</p>
                <div className="ag_card__chips">
                  <span className="ag_chip ag_chip--accent">{TRIGGER_ICON[p.trigger_type]} {p.trigger_summary}</span>
                  <span className="ag_chip">{p.agents.length} agent{p.agents.length === 1 ? "" : "s"}</span>
                  {p.last_run_status && <span className={`ag_status ag_status--${p.last_run_status}`}>{STATUS_TEXT[p.last_run_status] ?? `Last run ${p.last_run_status}`}</span>}
                </div>
                <div className="ag_card__footer">
                  <span />
                  <div className="ag_card__actions">
                    <Button variant="primary" onClick={() => navigate(`/studio/${p.id}`)}><Play size={14} /> Open</Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.name}”?`}
          message="The project, its triggers and its run history are deleted. Its agents stay on the Agents page."
          confirmLabel="Delete project"
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
      {importing && (
        <ImportDialog onClose={() => setImporting(false)} onDone={(r) => {
          setImporting(false);
          if (r.projects.length === 1) return navigate(`/studio/${r.projects[0].id}`);
          setNotice(`Imported ${r.projects.length} project(s) and ${r.agents.filter((x) => x.created).length} new agent(s).${r.warnings.length ? ` Note: ${r.warnings.join(" ")}` : ""}`);
          studioApi.list().then(setProjects).catch(() => {});
        }} />
      )}
    </div>
  );
};
