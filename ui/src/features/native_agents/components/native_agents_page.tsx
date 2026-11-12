import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Globe, Lock, MessageSquare, Monitor, MoreHorizontal, Pencil, Play, Plug, Plus, Terminal, Trash2, Wrench, X } from "lucide-react";
import { AgentAvatar } from "@/shared/ui/agent_avatar";
import { Button, ConfirmDialog, ErrorNote, Field, Modal, Toggle } from "@/shared/ui/ui";
import { AgentsNav } from "@/features/pipelines/components/pipelines_page";
import { NativeFunctionsModal } from "@/features/native_agents/components/native_functions";
import { NativeRunDialog } from "@/features/native_agents/components/native_run_dialog";
import {
  nativeAgentsApi, PLATFORM_LABEL, PROVIDER_LABEL,
  type NativeAgent, type NativeAgentInput, type NativeOverview, type NativeProvider,
} from "@/features/native_agents/api/native_agents_api";

const timeAgo = (iso: string) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const ICONS = ["🤖", "🔎", "📊", "🧾", "🛠️", "🧠", "📰", "💬"];

const emptyInput = (provider: NativeProvider, model: string): NativeAgentInput => ({
  provider, name: "", icon: "🤖", description: "", instructions: "", model,
  web_search: false, code_sandbox: false, knowledge_base: false, browser: false, mcp_servers: [],
});

export const NativeAgentsPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<NativeOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<NativeProvider | null>(null);
  const [editing, setEditing] = useState<{ id?: string; input: NativeAgentInput } | null>(null);
  const [deleting, setDeleting] = useState<NativeAgent | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [functionsFor, setFunctionsFor] = useState<NativeAgent | null>(null);
  const [runFor, setRunFor] = useState<NativeAgent | null>(null);

  useEffect(() => {
    nativeAgentsApi.overview().then(setData).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuFor]);

  const active = data?.activeProvider ?? null;
  const activeInfo = data?.providers.find((p) => p.id === active);
  const activeAgents = data?.agents.filter((a) => a.active) ?? [];
  const otherAgents = data?.agents.filter((a) => !a.active) ?? [];

  const switchTo = async (provider: NativeProvider) => {
    if (provider === active) return;
    setSwitching(provider);
    setError(null);
    try {
      setData(await nativeAgentsApi.setActiveProvider(provider));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't switch provider");
    } finally {
      setSwitching(null);
    }
  };

  const saved = (agent: NativeAgent) => {
    setData((d) => d && {
      ...d,
      agents: [{
        ...agent,
        function_count: d.agents.find((a) => a.id === agent.id)?.function_count ?? 0,
        code_function_count: d.agents.find((a) => a.id === agent.id)?.code_function_count ?? 0,
        active: agent.provider === d.activeProvider,
      }, ...d.agents.filter((a) => a.id !== agent.id)],
    });
    setEditing(null);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await nativeAgentsApi.remove(deleting.id);
      setData((d) => d && { ...d, agents: d.agents.filter((a) => a.id !== deleting.id) });
      setDeleting(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete the agent");
    } finally {
      setBusy(false);
    }
  };

  const card = (a: NativeAgent) => (
    <article key={a.id} className={`ag_card ${a.active ? "" : "na_card--off"}`} aria-disabled={!a.active}>
      <div className="ag_card__top">
        <span className="ag_card__icon"><AgentAvatar icon={a.icon} /></span>
        <span className={`na_badge na_badge--${a.provider}`}>{PROVIDER_LABEL[a.provider]}</span>
        <div className="ag_card__menu_wrap">
          <button type="button" className="ag_icon_btn" aria-label={`More actions for ${a.name}`}
            onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === a.id ? null : a.id); }}>
            <MoreHorizontal size={18} />
          </button>
          {menuFor === a.id && (
            <div className="ag_menu" role="menu">
              {a.active && <button type="button" role="menuitem" onClick={() => setRunFor(a)}><Play size={14} /> Run</button>}
              {a.active && <button type="button" role="menuitem" onClick={() => setEditing({ id: a.id, input: toInput(a) })}><Pencil size={14} /> Edit</button>}
              {a.active && <button type="button" role="menuitem" onClick={() => setFunctionsFor(a)}><Wrench size={14} /> Functions</button>}
              <button type="button" role="menuitem" className="is_danger" onClick={() => setDeleting(a)}><Trash2 size={14} /> Delete</button>
            </div>
          )}
        </div>
      </div>
      <h3 className="ag_card__name">{a.name}</h3>
      <p className="ag_card__desc">{a.description || "No description yet."}</p>
      <div className="ag_card__chips">
        <span className="ag_chip">{a.model}</span>
        {a.web_search && <span className="ag_chip"><Globe size={12} /> Web</span>}
        {a.code_sandbox && <span className="ag_chip"><Terminal size={12} /> Sandbox</span>}
        {a.browser && <span className="ag_chip"><Monitor size={12} /> Browser</span>}
        {a.knowledge_base && <span className="ag_chip"><BookOpen size={12} /> Documents</span>}
        {a.mcp_servers.length > 0 && <span className="ag_chip"><Plug size={12} /> {a.mcp_servers.length} MCP</span>}
        {a.active ? (
          <button type="button" className="ag_chip na_chip_btn" onClick={() => setFunctionsFor(a)} title="Manage functions">
            <Wrench size={12} /> {fnCount(a) ? `${fnCount(a)} function${fnCount(a) === 1 ? "" : "s"}` : "Add functions"}
          </button>
        ) : fnCount(a) > 0 && (
          <span className="ag_chip"><Wrench size={12} /> {fnCount(a)} function{fnCount(a) === 1 ? "" : "s"}</span>
        )}
      </div>
      <div className="ag_card__footer">
        {a.active ? (
          <>
            <span className="ag_muted ag_small">Edited {timeAgo(a.updated_at)}</span>
            <div className="ag_card__actions">
              <Button variant="ghost" onClick={() => setEditing({ id: a.id, input: toInput(a) })}>Edit</Button>
              <Button variant="primary" onClick={() => navigate(`/chathome?native=${a.id}`)}><MessageSquare size={15} /> Chat</Button>
            </div>
          </>
        ) : (
          <span className="ag_muted ag_small na_off_note"><Lock size={12} /> Disabled — switch to {PROVIDER_LABEL[a.provider]} to use it</span>
        )}
      </div>
    </article>
  );

  return (
    <div className="ag_page">
      <AgentsNav active="native" />
      <header className="ag_page__header">
        <div>
          <h1 className="ag_page__title">Provider agents</h1>
          <p className="ag_page__subtitle">
            Agents stored and run by the provider itself. Only the provider you switch on is active; the other one's agents are kept but disabled.
          </p>
        </div>
        {activeInfo && (
          <Button variant="primary" onClick={() => setEditing({ input: emptyInput(activeInfo.id, activeInfo.models[0]) })}>
            <Plus size={16} /> New {activeInfo.label} agent
          </Button>
        )}
      </header>

      {error && <div className="ag_error">{error}</div>}

      {data && data.providers.length === 0 && (
        <div className="ag_empty">
          <h2>No provider configured</h2>
          <p>Add ANTHROPIC_API_KEY or OPENAI_API_KEY to the server's .env and restart it.</p>
        </div>
      )}

      {data && data.providers.length > 0 && (
        <section className="na_switch" aria-label="Active provider">
          <div className="ag_segmented" role="radiogroup" aria-label="Active provider">
            {(["anthropic", "openai"] as NativeProvider[]).map((p) => {
              const available = data.providers.some((x) => x.id === p);
              return (
                <button key={p} type="button" role="radio" aria-checked={active === p} disabled={!available || !!switching}
                  className={active === p ? "is_active" : ""} onClick={() => switchTo(p)}
                  title={available ? `Use ${PLATFORM_LABEL[p]}` : `${PROVIDER_LABEL[p]} isn't configured on the server`}>
                  {switching === p ? "Switching…" : PROVIDER_LABEL[p]}
                </button>
              );
            })}
          </div>
          {active && (
            <p className="ag_muted ag_small">
              Active: <strong>{PLATFORM_LABEL[active]}</strong>{active === "openai" && " (beta)"}. Agents are stored in your {active === "anthropic" ? "Anthropic Console workspace" : "OpenAI API project"}.
            </p>
          )}
        </section>
      )}

      {data === null && !error && <div className="ag_grid">{[0, 1, 2].map((i) => <div key={i} className="ag_card ag_card--skeleton" />)}</div>}

      {data && activeInfo && activeAgents.length === 0 && (
        <div className="ag_empty">
          <h2>No {activeInfo.label} agents yet</h2>
          <p>Create one: it's saved in {PLATFORM_LABEL[activeInfo.id]}, which runs the agent loop{activeInfo.id === "anthropic" ? " and a sandbox for code" : ""}.</p>
        </div>
      )}
      {activeAgents.length > 0 && <div className="ag_grid">{activeAgents.map(card)}</div>}

      {otherAgents.length > 0 && (
        <section className="na_others">
          <h2 className="ag_section__title">Disabled agents</h2>
          <div className="ag_grid">{otherAgents.map(card)}</div>
        </section>
      )}

      {editing && data && (
        <NativeAgentDialog
          id={editing.id}
          initial={editing.input}
          models={data.providers.find((p) => p.id === editing.input.provider)?.models ?? [editing.input.model]}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}

      {runFor && <NativeRunDialog agent={runFor} onClose={() => setRunFor(null)} />}

      {functionsFor && (
        <NativeFunctionsModal
          agent={functionsFor}
          onClose={() => setFunctionsFor(null)}
          onCountsChanged={(http, code) => setData((d) => d && {
            ...d,
            agents: d.agents.map((x) => (x.id === functionsFor.id ? { ...x, function_count: http, code_function_count: code } : x)),
          })}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.name}”?`}
          message={deleting.provider === "anthropic"
            ? "The agent is archived in Claude Managed Agents and its remote sessions are deleted. Its functions are deleted too. Past chats stay in your history."
            : "The agent and its remote sessions are deleted from the OpenAI Agents API. Its functions are deleted too. Past chats stay in your history."}
          confirmLabel="Delete agent"
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
};

const fnCount = (a: NativeAgent) => (a.function_count ?? 0) + (a.code_function_count ?? 0);

const toInput = (a: NativeAgent): NativeAgentInput => ({
  provider: a.provider, name: a.name, icon: a.icon, description: a.description, instructions: a.instructions, model: a.model,
  web_search: a.web_search, code_sandbox: a.code_sandbox, knowledge_base: a.knowledge_base, browser: !!a.browser, mcp_servers: a.mcp_servers,
});

const NativeAgentDialog = ({ id, initial, models, onClose, onSaved }: {
  id?: string;
  initial: NativeAgentInput;
  models: string[];
  onClose: () => void;
  onSaved: (a: NativeAgent) => void;
}) => {
  const [form, setForm] = useState<NativeAgentInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof NativeAgentInput>(key: K, value: NativeAgentInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const label = PROVIDER_LABEL[form.provider];

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const mcp_servers = form.mcp_servers.filter((s) => s.name.trim() || s.url.trim());
      const body = { ...form, mcp_servers };
      onSaved(id ? await nativeAgentsApi.update(id, body) : await nativeAgentsApi.create(body));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the agent");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      wide
      title={id ? `Edit ${label} agent` : `New ${label} agent`}
      subtitle={`Saved in ${PLATFORM_LABEL[form.provider]}${id && form.provider === "anthropic" ? " — each save creates a new version" : ""}.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={saving} disabled={!form.name.trim()} onClick={save}>{id ? "Save changes" : "Create agent"}</Button>
        </>
      }
    >
      <div className="na_form">
        <div className="na_row">
          <Field label="Icon">
            <div className="na_icons" role="radiogroup" aria-label="Icon">
              {ICONS.map((i) => (
                <button key={i} type="button" role="radio" aria-checked={form.icon === i} className={`na_icon ${form.icon === i ? "is_active" : ""}`} onClick={() => set("icon", i)}>{i}</button>
              ))}
            </div>
          </Field>
        </div>
        <div className="na_row na_row--2">
          <Field label="Name">
            <input className="ag_input" value={form.name} maxLength={120} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Market researcher" autoFocus />
          </Field>
          <Field label="Model">
            <select className="ag_input" value={form.model} onChange={(e) => set("model", e.target.value)}>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Description" hint="Shown on the card.">
          <input className="ag_input" value={form.description} maxLength={500} onChange={(e) => set("description", e.target.value)} placeholder="One sentence about what it does" />
        </Field>
        <Field label="Instructions" hint="What the agent should do, how, and what to avoid.">
          <textarea className="ag_input" rows={7} value={form.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder="You are a research assistant. Search the web, compare at least three sources, and cite them." />
        </Field>

        <div className="na_caps">
          <span className="ag_field__label">Capabilities</span>
          <div className="na_cap">
            <div><strong><Globe size={14} /> Web search</strong><span className="ag_muted ag_small">Searches the web{form.provider === "anthropic" ? " and fetches pages" : ""}, run by {label}.</span></div>
            <Toggle checked={form.web_search} onChange={(v) => set("web_search", v)} label="Web search" />
          </div>
          <div className="na_cap">
            <div><strong><Terminal size={14} /> Code sandbox</strong><span className="ag_muted ag_small">A container hosted by {label} where the agent can run code and work with files. Billed by {label} while it runs.</span></div>
            <Toggle checked={form.code_sandbox} onChange={(v) => set("code_sandbox", v)} label="Code sandbox" />
          </div>
          {form.provider === "openai" && (
            <div className="na_cap">
              <div><strong><Monitor size={14} /> Browser</strong><span className="ag_muted ag_small">A browser on OpenAI's side that the agent can use to open sites, click and fill forms. It asks you in the chat before visiting a new site or signing in. Billed by OpenAI while it runs.</span></div>
              <Toggle checked={form.browser} onChange={(v) => set("browser", v)} label="Browser" />
            </div>
          )}
          <div className="na_cap">
            <div><strong><BookOpen size={14} /> Your documents</strong><span className="ag_muted ag_small">Lets the agent search your knowledge base. The search runs on this server.</span></div>
            <Toggle checked={form.knowledge_base} onChange={(v) => set("knowledge_base", v)} label="Your documents" />
          </div>
        </div>

        <div className="na_caps">
          <span className="ag_field__label"><Plug size={14} /> MCP servers</span>
          <span className="ag_muted ag_small">Public https servers without login. {label} connects to them directly.</span>
          {form.mcp_servers.map((s, i) => (
            <div key={i} className="na_mcp">
              <input className="ag_input" value={s.name} placeholder="name" aria-label="MCP server name"
                onChange={(e) => set("mcp_servers", form.mcp_servers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input className="ag_input" value={s.url} placeholder="https://example.com/mcp" aria-label="MCP server URL"
                onChange={(e) => set("mcp_servers", form.mcp_servers.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
              <button type="button" className="ag_icon_btn ag_icon_btn--danger" aria-label="Remove MCP server" onClick={() => set("mcp_servers", form.mcp_servers.filter((_, j) => j !== i))}><X size={16} /></button>
            </div>
          ))}
          {form.mcp_servers.length < 10 && (
            <Button variant="ghost" onClick={() => set("mcp_servers", [...form.mcp_servers, { name: "", url: "" }])}><Plus size={14} /> Add MCP server</Button>
          )}
        </div>
        <ErrorNote message={error} />
      </div>
    </Modal>
  );
};
