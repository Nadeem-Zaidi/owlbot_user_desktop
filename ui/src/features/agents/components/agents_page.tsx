import { useEffect, useState } from "react";
import { useWorkspaces } from "@/features/workspaces/lib/use_workspaces";
import { useNavigate } from "react-router-dom";
import { Clock, Download, MessageSquare, MoreHorizontal, Pencil, Play, Plug, Plus, Sparkles, Trash2, Upload, Wrench } from "lucide-react";
import { agentsApi } from "@/features/agents/api/agents_api";
import type { AgentSummary } from "@/features/agents/types";
import { AgentAvatar } from "@/shared/ui/agent_avatar";
import { Button, ConfirmDialog } from "@/shared/ui/ui";
import { AgentsNav } from "@/features/pipelines/components/pipelines_page";
import { RunDialog } from "@/features/agents/components/run_dialog";
import { downloadJson, portableApi } from "@/features/portable/api/portable_api";
import { ImportDialog } from "@/features/portable/components/import_dialog";

// Ideas shown when the user has no agents yet — clicking one opens the
// editor with the description pre-filled for "Generate with AI".
const IDEAS = [
  { icon: "🧾", title: "Document expert", text: "An agent that answers questions only from my uploaded documents, cites the document it used, and says clearly when the answer isn't in them." },
  { icon: "🎓", title: "Study buddy", text: "An agent that quizzes me on a topic from my knowledge base one question at a time, grades my answer, and explains what I got wrong." },
  { icon: "📰", title: "Morning briefing", text: "An agent that writes a short morning briefing: today's date, three priorities to focus on, and one motivating line. Keep it under 120 words." },
  { icon: "🛠️", title: "API helper", text: "An agent that calls my company's REST API to look up orders and customers, and explains the results in plain language." },
];

const timeAgo = (iso: string) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export const AgentsPage = () => {
  const navigate = useNavigate();
  // The active team workspace (null in the personal space).
  const { active: team } = useWorkspaces();
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AgentSummary | null>(null);
  const [running, setRunning] = useState<AgentSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const exportAgent = async (a: AgentSummary) => {
    setMenuFor(null);
    try {
      downloadJson(await portableApi.exportAgent(a.id), a.name);
      setNotice(`Exported “${a.name}”. Tokens and secret values aren't in the file — you add them when importing.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't export");
    }
  };

  useEffect(() => {
    agentsApi.list().then(setAgents).catch((e) => setError(e.message));
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
      await agentsApi.remove(deleting.id);
      setAgents((list) => (list ?? []).filter((a) => a.id !== deleting.id));
      setDeleting(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete the agent");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ag_page">
      <AgentsNav active="agents" />
      <header className="ag_page__header">
        <div>
          <h1 className="ag_page__title">Agents</h1>
          <p className="ag_page__subtitle">
            {team
              ? <>Shared with everyone in <strong>{team.name}</strong>. Anyone in the team can use them; creators and admins can change them.</>
              : "Custom assistants with their own instructions, tools and schedules."}
          </p>
        </div>
        <div className="pt_head_actions">
          <Button onClick={() => setImporting(true)}><Upload size={16} /> Import</Button>
          <Button variant="primary" onClick={() => navigate("/agents/new")}><Plus size={16} /> New agent</Button>
        </div>
      </header>

      {error && <div className="ag_error">{error}</div>}
      {notice && <div className="mk_notice">{notice}</div>}

      {agents === null && !error && (
        <div className="ag_grid">{[0, 1, 2].map((i) => <div key={i} className="ag_card ag_card--skeleton" />)}</div>
      )}

      {agents?.length === 0 && (
        <div className="ag_empty">
          <span className="ag_empty__icon"><Sparkles size={22} /></span>
          <h2>Create your first agent</h2>
          <p>Describe what it should do — Owl drafts the instructions for you. Start from an idea:</p>
          <div className="ag_ideas">
            {IDEAS.map((idea) => (
              <button key={idea.title} type="button" className="ag_idea" onClick={() => navigate("/agents/new", { state: { describe: idea.text } })}>
                <span className="ag_idea__icon">{idea.icon}</span>
                <span className="ag_idea__title">{idea.title}</span>
                <span className="ag_idea__text">{idea.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!!agents?.length && (
        <div className="ag_grid">
          {agents.map((a) => {
            const toolCount = a.builtin_tools.length + a.function_count + (a.code_function_count ?? 0);
            return (
              <article key={a.id} className="ag_card">
                <div className="ag_card__top">
                  <span className="ag_card__icon"><AgentAvatar icon={a.icon} /></span>
                  <div className="ag_card__menu_wrap">
                    <button
                      type="button"
                      className="ag_icon_btn"
                      aria-label={`More actions for ${a.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuFor(menuFor === a.id ? null : a.id);
                      }}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {menuFor === a.id && (
                      <div className="ag_menu" role="menu">
                        <button type="button" role="menuitem" onClick={() => setRunning(a)}><Play size={14} /> Run</button>
                        <button type="button" role="menuitem" onClick={() => navigate(`/agents/${a.id}`)}><Pencil size={14} /> {a.can_edit === false ? "View" : "Edit"}</button>
                        <button type="button" role="menuitem" onClick={() => navigate(`/agents/${a.id}?tab=schedules`)}><Clock size={14} /> Schedules</button>
                        <button type="button" role="menuitem" onClick={() => void exportAgent(a)}><Download size={14} /> Export JSON</button>
                        {a.can_edit !== false && <button type="button" role="menuitem" className="is_danger" onClick={() => setDeleting(a)}><Trash2 size={14} /> Delete</button>}
                      </div>
                    )}
                  </div>
                </div>
                <h3 className="ag_card__name">{a.name}</h3>
                {team && a.creator_name && <span className="ag_card__by">by {a.creator_name}</span>}
                <p className="ag_card__desc">{a.description || "No description yet."}</p>
                <div className="ag_card__chips">
                  {a.model && <span className="ag_chip">{a.model}</span>}
                  {toolCount > 0 && <span className="ag_chip"><Wrench size={12} /> {toolCount} tool{toolCount === 1 ? "" : "s"}</span>}
                  {a.mcp_count > 0 && <span className="ag_chip"><Plug size={12} /> {a.mcp_count} MCP</span>}
                  {a.schedule_count > 0 && <span className="ag_chip ag_chip--accent"><Clock size={12} /> {a.schedule_count} scheduled</span>}
                </div>
                <div className="ag_card__footer">
                  <span className="ag_muted ag_small">Edited {timeAgo(a.updated_at)}</span>
                  <div className="ag_card__actions">
                    <Button variant="ghost" onClick={() => navigate(`/agents/${a.id}`)}>{a.can_edit === false ? "View" : "Edit"}</Button>
                    <Button variant="primary" onClick={() => navigate(`/chathome?agent=${a.id}`)}><MessageSquare size={15} /> Chat</Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {running && (
        <RunDialog
          onClose={() => setRunning(null)}
          target={{
            kind: "agent",
            id: running.id,
            name: running.name,
            subtitle: `Runs once${running.model ? ` with ${running.model}` : ""}, using the agent's instructions and tools. The run is saved as a chat you can open later.`,
            placeholder: running.starters[0] ? `e.g. ${running.starters[0]}` : undefined,
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.name}”?`}
          message="Its functions, MCP connections and schedules are deleted too. Past chats with it stay in your history."
          confirmLabel="Delete agent"
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
      {importing && (
        <ImportDialog onClose={() => setImporting(false)} onDone={(r) => {
          setImporting(false);
          setNotice(`Imported ${r.agents.filter((x) => x.created).length} agent(s)${r.projects.length ? ` and ${r.projects.length} project(s)` : ""}.${r.warnings.length ? ` Note: ${r.warnings.join(" ")}` : ""}`);
          agentsApi.list().then(setAgents).catch(() => {});
        }} />
      )}
    </div>
  );
};
