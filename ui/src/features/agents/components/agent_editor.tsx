import { useCallback, useEffect, useMemo, useState } from "react";
import { DEV_SETUP_TEMPLATE } from "@/features/agents/lib/dev_setup_template";
import { activeWorkspaceId } from "@/shared/lib/workspace";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Activity, ArrowLeft, CalendarClock, Check, ChevronDown, Clock, ExternalLink, FileText, Globe, Lock, MessageSquare,
  Code2, Pause, Pencil, Play, Plug, Plus, RefreshCw, Search, Settings2, Sparkles, TerminalSquare, Trash2, Wrench, X,
} from "lucide-react";
import { api } from "@/features/chat/api/chat_api";
import type { KnowledgeDocument } from "@/shared/types";
import { agentsApi } from "@/features/agents/api/agents_api";
import type { AgentCatalog, AgentDetail, AgentFunction, AgentInput, AgentLimits, AgentRun, CodeFunction, McpServer, Schedule } from "@/features/agents/types";
import { CodeFunctionDialog } from "@/features/agents/components/code_function_dialog";
import { FunctionDialog } from "@/features/agents/components/function_dialog";
import { McpDialog } from "@/features/agents/components/mcp_dialog";
import { McpEditDialog } from "@/features/agents/components/mcp_edit_dialog";
import { ScheduleDialog } from "@/features/agents/components/schedule_dialog";
import { AgentAvatar } from "@/shared/ui/agent_avatar";
import { Button, ConfirmDialog, ErrorNote, Toggle } from "@/shared/ui/ui";
import { InstructionFilesEditor, InstructionsImport, LoadDescriptionButton } from "@/features/agents/components/instruction_files";
import { AgentSkillsSection } from "@/features/skills/components/agent_skills";
import { HelperAgentsSection } from "@/features/agents/components/helper_agents_section";
import { MarkdownOutput } from "@/features/chat/components/markdown_output";

type Tab = "configure" | "tools" | "schedules" | "activity";

const EMOJIS = ["🤖", "🧠", "🦉", "📚", "🧾", "🎓", "💼", "📰", "🛠️", "🔍", "📈", "💡", "✍️", "🧪", "🗂️", "📅", "🌐", "🛡️", "💬", "🎯", "⚙️", "📦", "🧭", "🚀"];

const EMPTY: AgentInput = { name: "", icon: "🤖", description: "", instructions: "", provider: null, model: null, builtin_tools: ["search_knowledge_base"], document_keys: [], starters: [], instruction_files: [], skill_mode: "all", skill_ids: [], helper_agent_ids: [], limits: {} };

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
const relative = (iso: string | null) => {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff) / 60000;
  const unit = abs < 60 ? `${Math.round(abs)} min` : abs < 1440 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} d`;
  return diff >= 0 ? `in ${unit}` : `${unit} ago`;
};

export const AgentEditor = () => {
  const { id: routeId } = useParams();
  const isNew = !routeId || routeId === "new";
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const tab = ((!isNew && params.get("tab")) || "configure") as Tab;

  const [catalog, setCatalog] = useState<AgentCatalog | null>(null);
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [form, setForm] = useState<AgentInput>(EMPTY);
  const [saved, setSaved] = useState<AgentInput>(EMPTY);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [whatsappLinked, setWhatsappLinked] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [describe, setDescribe] = useState<string>((location.state as { describe?: string } | null)?.describe ?? "");
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cat, docs, wa] = await Promise.all([
        agentsApi.catalog(),
        api.getDocuments().catch(() => [] as KnowledgeDocument[]),
        api.getWhatsAppStatus().catch(() => null),
      ]);
      setCatalog(cat);
      setDocuments(docs);
      setWhatsappLinked(!!wa?.link);
      if (!isNew) {
        const d = await agentsApi.getAgent(routeId!);
        setDetail(d);
        const input: AgentInput = {
          name: d.name, icon: d.icon, description: d.description, instructions: d.instructions, provider: d.provider,
          model: d.model, builtin_tools: d.builtin_tools, document_keys: d.document_keys, starters: d.starters,
          instruction_files: d.instruction_files ?? [],
          skill_mode: d.skill_mode ?? "all", skill_ids: d.skill_ids ?? [],
          helper_agent_ids: d.helper_agent_ids ?? [],
          limits: d.limits ?? {},
        };
        setForm(input);
        setSaved(input);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load the agent");
    }
  }, [isNew, routeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  // A team agent you didn't create (and aren't an admin of): view only.
  const readOnly = detail?.can_edit === false;
  const set = <K extends keyof AgentInput>(key: K, value: AgentInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const generate = async () => {
    setDrafting(true);
    setError(null);
    try {
      const d = await agentsApi.draft(describe);
      setForm((f) => ({ ...f, ...d, builtin_tools: [...new Set([...d.builtin_tools])], starters: d.starters }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate a draft");
    } finally {
      setDrafting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const created = await agentsApi.create(form);
        navigate(`/agents/${created.id}?tab=tools`, { replace: true });
        return;
      }
      await agentsApi.update(routeId!, form);
      setSaved(form);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const setTab = (t: Tab) => setParams(t === "configure" ? {} : { tab: t }, { replace: true });

  if (loadError) {
    return (
      <div className="ag_page">
        <div className="ag_error">{loadError}</div>
        <Button onClick={() => navigate("/agents")}><ArrowLeft size={15} /> Back to agents</Button>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: "configure", label: "Configure", icon: <Settings2 size={15} /> },
    { id: "tools", label: "Tools", icon: <Wrench size={15} />, count: detail ? detail.functions.length + (detail.codeFunctions?.length ?? 0) + detail.mcpServers.length : undefined },
    { id: "schedules", label: "Schedules", icon: <CalendarClock size={15} />, count: detail?.schedules.length },
    { id: "activity", label: "Activity", icon: <Activity size={15} /> },
  ];

  return (
    <div className="ag_page ag_page--editor">
      <header className="ag_editor_head">
        <button type="button" className="ag_back" onClick={() => navigate("/agents")}><ArrowLeft size={16} /> Agents</button>
        <div className="ag_editor_head__title">
          <span className="ag_editor_head__icon"><AgentAvatar icon={form.icon} /></span>
          <h1>{isNew ? "New agent" : form.name || "Untitled agent"}</h1>
        </div>
        {!isNew && (
          <Button variant="primary" onClick={() => navigate(`/chathome?agent=${routeId}`)} disabled={dirty} title={dirty ? "Save your changes first" : undefined}>
            <MessageSquare size={15} /> Chat with agent
          </Button>
        )}
      </header>

      {readOnly && (
        <div className="ws_banner" role="note">
          <Lock size={15} />
          <span>This team agent is shared with you — you can chat with it, but only its creator or a workspace admin can change it.</span>
        </div>
      )}

      <nav className="ag_tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`ag_tab ${tab === t.id ? "is_active" : ""}`}
            disabled={isNew && t.id !== "configure"}
            title={isNew && t.id !== "configure" ? "Create the agent first" : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.icon} {t.label}
            {!!t.count && <span className="ag_tab__count">{t.count}</span>}
          </button>
        ))}
      </nav>

      <fieldset className="ws_readonly" disabled={readOnly}>
      {tab === "configure" && catalog && (
        <ConfigureTab
          isNew={isNew}
          agentId={isNew ? undefined : routeId}
          form={form}
          set={set}
          catalog={catalog}
          documents={documents}
          describe={describe}
          setDescribe={setDescribe}
          drafting={drafting}
          onGenerate={generate}
          team={isNew ? !!activeWorkspaceId() : !!detail?.workspace_id}
          onTemplate={() => setForm((f) => ({ ...f, ...DEV_SETUP_TEMPLATE }))}
        />
      )}
      {tab === "tools" && detail && <ToolsTab detail={detail} setDetail={setDetail} catalog={catalog} />}
      {tab === "schedules" && detail && <SchedulesTab detail={detail} setDetail={setDetail} whatsappLinked={whatsappLinked} email={catalog?.email} />}
      </fieldset>
      {tab === "activity" && detail && <ActivityTab agentId={detail.id} />}

      {tab === "configure" && !readOnly && (
        <div className={`ag_savebar ${dirty || isNew ? "is_visible" : ""}`}>
          <ErrorNote message={error} />
          <span className="ag_muted ag_small">{isNew ? "Name your agent, then create it — tools and schedules come next." : justSaved ? "Saved" : "You have unsaved changes"}</span>
          {!isNew && <Button variant="ghost" onClick={() => setForm(saved)} disabled={!dirty}>Discard</Button>}
          <Button variant="primary" onClick={save} busy={saving} disabled={!form.name.trim() || (!isNew && !dirty)}>
            {justSaved ? <><Check size={15} /> Saved</> : isNew ? "Create agent" : "Save changes"}
          </Button>
        </div>
      )}
    </div>
  );
};

// ── Configure ────────────────────────────────────────────────────────────
const ConfigureTab = ({ isNew, agentId, form, set, catalog, documents, describe, setDescribe, drafting, onGenerate, team, onTemplate }: {
  isNew: boolean;
  agentId?: string;
  form: AgentInput;
  set: <K extends keyof AgentInput>(key: K, value: AgentInput[K]) => void;
  catalog: AgentCatalog;
  documents: KnowledgeDocument[];
  describe: string;
  setDescribe: (v: string) => void;
  drafting: boolean;
  onGenerate: () => void;
  // A team workspace agent: local commands are never offered.
  team: boolean;
  onTemplate: () => void;
}) => {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [describeOpen, setDescribeOpen] = useState(isNew);
  const [docQuery, setDocQuery] = useState("");
  const scoped = form.document_keys.length > 0;
  const filteredDocs = useMemo(() => documents.filter((d) => d.name.toLowerCase().includes(docQuery.toLowerCase())), [documents, docQuery]);
  const toolOn = (id: string) => form.builtin_tools.includes(id);
  const canLocal = !!catalog.localCommands?.canUse && !team;
  // Owners see the desktop-only tool; others only if it's already on (so they can turn it off).
  const builtins = catalog.builtinTools.filter((t) => !t.desktopOnly || canLocal || toolOn(t.id));
  const limits = form.limits ?? {};
  const setLimit = (k: keyof AgentLimits, v: string) => {
    const n = v.trim() === "" ? undefined : Number(v);
    set("limits", { ...limits, [k]: n });
  };
  const modelValue = form.provider && form.model ? `${form.provider}::${form.model}` : "";
  const providerLabel = catalog.providers.find((p) => p.id === (form.provider ?? catalog.defaultProvider))?.label;

  return (
    <div className="ag_configure">
      <div className="ag_configure__main">
        <section className={`ag_section ag_describe ${describeOpen ? "" : "is_collapsed"}`}>
          <button type="button" className="ag_section__toggle" onClick={() => setDescribeOpen((v) => !v)} aria-expanded={describeOpen}>
            <span className="ag_describe__badge"><Sparkles size={16} /></span>
            <span>
              <strong>{isNew ? "Describe what this agent should do" : "Regenerate from a description"}</strong>
              <span className="ag_muted ag_small">Owl writes the name, instructions, tools and starters for you.</span>
            </span>
            <ChevronDown size={18} className="ag_chevron" />
          </button>
          {describeOpen && (
            <div className="ag_describe__body">
              <textarea
                className="ag_input"
                rows={4}
                value={describe}
                onChange={(e) => setDescribe(e.target.value)}
                placeholder="e.g. An agent that answers questions about our invoicing process using my documents, explains each step simply, and always says which document it used."
              />
              <div className="ag_describe__actions">
                <span className="ag_muted ag_small">{isNew ? "You can edit everything afterwards." : "This replaces the fields below — you can still discard."}</span>
                <span className="ag_spacer" />
                <LoadDescriptionButton onLoad={setDescribe} />
                <Button variant="primary" onClick={onGenerate} busy={drafting} disabled={describe.trim().length < 10}>
                  <Sparkles size={15} /> {drafting ? "Generating…" : "Generate with AI"}
                </Button>
              </div>
            </div>
          )}
        </section>

        {isNew && canLocal && (
          <div className="ag_note ag_template_note">
            <TerminalSquare size={16} />
            <span><strong>Dev machine setup</strong> — a ready-made agent that installs and checks developer tools on your computer (desktop app), one approved command at a time.</span>
            <Button variant="ghost" onClick={onTemplate}>Use template</Button>
          </div>
        )}

        <section className="ag_section">
          <h2 className="ag_section__title">Identity</h2>
          <div className="ag_identity">
            <div className="ag_emoji">
              <button type="button" className="ag_emoji__btn" onClick={() => setEmojiOpen((v) => !v)} aria-label="Choose icon"><AgentAvatar icon={form.icon} /></button>
              {emojiOpen && (
                <div className="ag_emoji__grid">
                  {EMOJIS.map((e) => (
                    <button key={e} type="button" onClick={() => { set("icon", e); setEmojiOpen(false); }}><AgentAvatar icon={e} /></button>
                  ))}
                </div>
              )}
            </div>
            <div className="ag_identity__fields">
              <input className="ag_input ag_input--title" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Agent name" maxLength={60} />
              <input className="ag_input" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="One line about what it does (shown on its card)" maxLength={300} />
            </div>
          </div>
        </section>

        <section className="ag_section">
          <div className="ag_section__head">
            <h2 className="ag_section__title">Instructions</h2>
            <span className="ag_muted ag_small">{form.instructions.length.toLocaleString()} / 20,000</span>
          </div>
          <InstructionsImport value={form.instructions} onChange={(text) => set("instructions", text)} agentName={form.name}>
            <textarea
              className="ag_input ag_instructions"
              rows={10}
              value={form.instructions}
              onChange={(e) => set("instructions", e.target.value)}
              placeholder={"You are… Explain your role, how to answer (tone, format, length), what to do when information is missing, and anything to avoid.\n\nTip: drop a .md file here to use it as the instructions."}
              maxLength={20000}
            />
          </InstructionsImport>
          <InstructionFilesEditor files={form.instruction_files} onChange={(files) => set("instruction_files", files)} />
        </section>

        <section className="ag_section">
          <h2 className="ag_section__title">Model</h2>
          <select
            className="ag_input"
            value={modelValue}
            onChange={(e) => {
              const [provider, model] = e.target.value ? e.target.value.split("::") : [null, null];
              set("provider", provider);
              set("model", model);
            }}
          >
            <option value="">Server default ({providerLabel})</option>
            {catalog.providers.map((p) => (
              <optgroup key={p.id} label={p.label}>
                {p.models.map((m) => <option key={m} value={`${p.id}::${m}`}>{m}</option>)}
              </optgroup>
            ))}
          </select>
        </section>

        <section className="ag_section">
          <h2 className="ag_section__title">Knowledge</h2>
          <div className="ag_segmented" role="radiogroup">
            <button type="button" role="radio" aria-checked={!scoped} className={!scoped ? "is_active" : ""} onClick={() => set("document_keys", [])}>All my documents</button>
            <button type="button" role="radio" aria-checked={scoped} className={scoped ? "is_active" : ""} disabled={!documents.length} onClick={() => !scoped && documents[0] && set("document_keys", [documents[0].key])}>Only selected documents</button>
          </div>
          {scoped && (
            <div className="ag_docs">
              <label className="ag_search"><Search size={14} /><input value={docQuery} onChange={(e) => setDocQuery(e.target.value)} placeholder="Filter documents" /></label>
              <div className="ag_docs__list">
                {filteredDocs.map((d) => {
                  const on = form.document_keys.includes(d.key);
                  return (
                    <label key={d.key} className={`ag_doc ${on ? "is_on" : ""}`}>
                      <input type="checkbox" checked={on} onChange={() => set("document_keys", on ? form.document_keys.filter((k) => k !== d.key) : [...form.document_keys, d.key])} />
                      <FileText size={14} /> <span>{d.name}</span>
                    </label>
                  );
                })}
              </div>
              <span className="ag_muted ag_small">{form.document_keys.length} selected</span>
            </div>
          )}
          {!documents.length && <p className="ag_muted ag_small">Your knowledge base is empty — upload documents from “Knowledge base” in the sidebar.</p>}
        </section>

        <AgentSkillsSection
          mode={form.skill_mode ?? "all"}
          ids={form.skill_ids ?? []}
          onChange={(mode, ids) => { set("skill_mode", mode); set("skill_ids", ids); }}
        />

        <HelperAgentsSection agentId={agentId} ids={form.helper_agent_ids ?? []} onChange={(ids) => set("helper_agent_ids", ids)} />

        <section className="ag_section">
          <h2 className="ag_section__title">Built-in tools</h2>
          <div className="ag_builtins">
            {builtins.map((t) => (
              <div key={t.id} className={`ag_builtin ${toolOn(t.id) ? "is_on" : ""} ${t.desktopOnly ? "ag_builtin--danger" : ""}`}>
                <div>
                  <strong>{t.label}</strong>
                  <span className="ag_muted ag_small">{t.description}</span>
                  {t.desktopOnly && toolOn(t.id) && (
                    <span className="ag_small ag_builtin__warn">
                      Works only when you chat with this agent in the Owl app, with “Allow agents to run commands” switched on in its tray menu.
                      Commands run as you on your computer — read each one before pressing “Run once”.
                    </span>
                  )}
                </div>
                <Toggle label={t.label} checked={toolOn(t.id)} onChange={(v) => set("builtin_tools", v ? [...form.builtin_tools, t.id] : form.builtin_tools.filter((x) => x !== t.id))} />
              </div>
            ))}
          </div>
          <p className="ag_muted ag_small">Connect APIs and MCP servers in the <strong>Tools</strong> tab{isNew ? " after creating the agent" : ""}.</p>
        </section>

        <section className="ag_section">
          <h2 className="ag_section__title">Limits per answer</h2>
          <p className="ag_muted ag_small">
            Stops a long run with a progress report instead of going on forever. Leave empty for the defaults (12 tool rounds, no time or token limit).
            Raise the rounds for agents that work through many steps, like machine setup.
          </p>
          <div className="ag_limits">
            <label className="ag_limit">
              <span className="ag_small">Tool rounds</span>
              <input className="ag_input" type="number" min={1} max={50} placeholder="12" value={limits.max_rounds ?? ""} onChange={(e) => setLimit("max_rounds", e.target.value)} />
            </label>
            <label className="ag_limit">
              <span className="ag_small">Minutes</span>
              <input className="ag_input" type="number" min={1} max={120} placeholder="No limit" value={limits.max_minutes ?? ""} onChange={(e) => setLimit("max_minutes", e.target.value)} />
            </label>
            <label className="ag_limit">
              <span className="ag_small">Tokens</span>
              <input className="ag_input" type="number" min={10000} max={5000000} step={10000} placeholder="No limit" value={limits.max_tokens ?? ""} onChange={(e) => setLimit("max_tokens", e.target.value)} />
            </label>
          </div>
        </section>

        <section className="ag_section">
          <div className="ag_section__head">
            <h2 className="ag_section__title">Conversation starters</h2>
            <Button variant="ghost" onClick={() => set("starters", [...form.starters, ""])} disabled={form.starters.length >= 6}><Plus size={14} /> Add</Button>
          </div>
          {form.starters.length === 0 && <p className="ag_muted ag_small">Example first messages, shown when someone opens a new chat with this agent.</p>}
          {form.starters.map((s, i) => (
            <div key={i} className="ag_starter_row">
              <input className="ag_input" value={s} onChange={(e) => set("starters", form.starters.map((x, j) => (j === i ? e.target.value : x)))} placeholder="How does the 3-way match work?" maxLength={200} />
              <button type="button" className="ag_icon_btn" aria-label="Remove starter" onClick={() => set("starters", form.starters.filter((_, j) => j !== i))}><X size={15} /></button>
            </div>
          ))}
        </section>
      </div>

      <aside className="ag_configure__side">
        <div className="ag_preview">
          <span className="ag_muted ag_small ag_preview__label">Preview</span>
          <div className="ag_preview__icon"><AgentAvatar icon={form.icon} /></div>
          <h3>{form.name || "Your agent"}</h3>
          <p className="ag_muted">{form.description || "A short description appears here."}</p>
          {form.starters.filter(Boolean).length > 0 && (
            <div className="ag_preview__starters">
              {form.starters.filter(Boolean).slice(0, 4).map((s) => <span key={s} className="ag_preview__starter">{s}</span>)}
            </div>
          )}
          <div className="ag_preview__meta">
            <span><Wrench size={13} /> {form.builtin_tools.length} built-in tool{form.builtin_tools.length === 1 ? "" : "s"}</span>
            <span><FileText size={13} /> {scoped ? `${form.document_keys.length} document${form.document_keys.length === 1 ? "" : "s"}` : "All documents"}</span>
            {form.instruction_files.length > 0 && (
              <span><FileText size={13} /> {form.instruction_files.filter((f) => f.enabled).length} instruction file{form.instruction_files.filter((f) => f.enabled).length === 1 ? "" : "s"}</span>
            )}
            <span><Globe size={13} /> {form.model ?? "Default model"}</span>
          </div>
        </div>
      </aside>
    </div>
  );
};

// ── Tools ────────────────────────────────────────────────────────────────
const ToolsTab = ({ detail, setDetail, catalog }: { detail: AgentDetail; setDetail: (d: AgentDetail) => void; catalog: AgentCatalog | null }) => {
  const [fnDialog, setFnDialog] = useState<{ open: boolean; fn?: AgentFunction }>({ open: false });
  const [codeDialog, setCodeDialog] = useState<{ open: boolean; fn?: CodeFunction }>({ open: false });
  const codeFunctions = detail.codeFunctions ?? [];
  const code = catalog?.codeFunctions;
  const [mcpDialog, setMcpDialog] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingMcp, setEditingMcp] = useState<McpServer | null>(null);
  const [toolQuery, setToolQuery] = useState("");
  const [confirm, setConfirm] = useState<{ kind: "fn" | "mcp" | "code"; id: string; name: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const replaceFn = (fn: AgentFunction) => setDetail({ ...detail, functions: detail.functions.some((f) => f.id === fn.id) ? detail.functions.map((f) => (f.id === fn.id ? fn : f)) : [...detail.functions, fn] });
  const replaceCode = (fn: CodeFunction) => setDetail({ ...detail, codeFunctions: codeFunctions.some((f) => f.id === fn.id) ? codeFunctions.map((f) => (f.id === fn.id ? fn : f)) : [...codeFunctions, fn] });
  const replaceMcp = (s: McpServer) => setDetail({ ...detail, mcpServers: detail.mcpServers.some((x) => x.id === s.id) ? detail.mcpServers.map((x) => (x.id === s.id ? s : x)) : [...detail.mcpServers, s] });

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const toggleFn = (fn: AgentFunction, enabled: boolean) =>
    run(`fn:${fn.id}`, async () => replaceFn(await agentsApi.updateFunction(detail.id, fn.id, { ...fn, enabled })));

  const toggleMcpTool = (s: McpServer, toolName: string, on: boolean) =>
    run(`mcp:${s.id}`, async () => {
      const enabledTools = s.tools.filter((t) => (t.name === toolName ? on : t.enabled)).map((t) => t.name);
      replaceMcp(await agentsApi.updateMcp(detail.id, s.id, { enabledTools }));
    });

  // Switch many tools at once (the ones shown by the filter, or all).
  const setMcpTools = (s: McpServer, names: string[], on: boolean) =>
    run(`mcp:${s.id}`, async () => {
      const target = new Set(names);
      const enabledTools = s.tools.filter((t) => (target.has(t.name) ? on : t.enabled)).map((t) => t.name);
      replaceMcp(await agentsApi.updateMcp(detail.id, s.id, { enabledTools }));
    });

  const doDelete = () =>
    confirm &&
    run("delete", async () => {
      if (confirm.kind === "fn") {
        await agentsApi.deleteFunction(detail.id, confirm.id);
        setDetail({ ...detail, functions: detail.functions.filter((f) => f.id !== confirm.id) });
      } else if (confirm.kind === "code") {
        await agentsApi.deleteCodeFunction(detail.id, confirm.id);
        setDetail({ ...detail, codeFunctions: codeFunctions.filter((f) => f.id !== confirm.id) });
      } else {
        await agentsApi.deleteMcp(detail.id, confirm.id);
        setDetail({ ...detail, mcpServers: detail.mcpServers.filter((s) => s.id !== confirm.id) });
      }
      setConfirm(null);
    });

  return (
    <div className="ag_tab_body">
      <ErrorNote message={error} />

      <section className="ag_section">
        <div className="ag_section__head">
          <div>
            <h2 className="ag_section__title">Functions</h2>
            <p className="ag_muted ag_small">Let the agent call any HTTP API — your backend, a SaaS API, a webhook.</p>
          </div>
          <Button variant="primary" onClick={() => setFnDialog({ open: true })}><Plus size={15} /> Add function</Button>
        </div>
        {detail.functions.length === 0 ? (
          <button type="button" className="ag_placeholder" onClick={() => setFnDialog({ open: true })}>
            <Wrench size={18} /> <span><strong>No functions yet</strong> — try the Weather preset to see how it works.</span>
          </button>
        ) : (
          <div className="ag_list">
            {detail.functions.map((fn) => (
              <div key={fn.id} className={`ag_item ${fn.enabled ? "" : "is_off"}`}>
                <span className={`ag_method_badge ag_method_badge--${fn.method.toLowerCase()}`}>{fn.method}</span>
                <div className="ag_item__main">
                  <strong className="ag_mono">{fn.name}</strong>
                  <span className="ag_item__sub ag_mono">{fn.url}</span>
                  {fn.description && <span className="ag_muted ag_small">{fn.description}</span>}
                </div>
                {fn.headers.some((h) => h.secret) && <span className="ag_chip" title="Has secret headers"><Lock size={12} /> secret</span>}
                <Toggle label={fn.enabled ? "Disable function" : "Enable function"} checked={fn.enabled} disabled={busy === `fn:${fn.id}`} onChange={(v) => toggleFn(fn, v)} />
                <button type="button" className="ag_icon_btn" aria-label={`Edit ${fn.name}`} onClick={() => setFnDialog({ open: true, fn })}><Pencil size={15} /></button>
                <button type="button" className="ag_icon_btn ag_icon_btn--danger" aria-label={`Delete ${fn.name}`} onClick={() => setConfirm({ kind: "fn", id: fn.id, name: fn.name })}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="ag_section">
        <div className="ag_section__head">
          <div>
            <h2 className="ag_section__title">Code functions <span className="ag_chip">Python</span></h2>
            <p className="ag_muted ag_small">Write your own Python the agent can run — crunch large data, call several APIs, do maths. Runs in your Python service.</p>
          </div>
          {code?.enabled && code.canWrite && <Button variant="primary" onClick={() => setCodeDialog({ open: true })}><Code2 size={15} /> Write function</Button>}
        </div>
        {!code?.enabled ? (
          <div className="ag_note">
            <strong>Turned off.</strong> Code functions run Python on your server, so they're for the app owner only. To turn them on, add
            <code>OWNER_EMAILS={code?.email ?? "you@example.com"}</code> to the backend <code>.env</code> and restart it.
          </div>
        ) : !code.canWrite ? (
          <div className="ag_note">Only the app owner can write or change code functions{codeFunctions.length ? " — the ones below still run." : "."}</div>
        ) : codeFunctions.length === 0 ? (
          <button type="button" className="ag_placeholder" onClick={() => setCodeDialog({ open: true })}>
            <Code2 size={18} /> <span><strong>No code functions yet</strong> — start from the template, then press Run to test it.</span>
          </button>
        ) : null}
        {codeFunctions.length > 0 && (
          <div className="ag_list">
            {codeFunctions.map((fn) => (
              <div key={fn.id} className={`ag_item ${fn.enabled ? "" : "is_off"}`}>
                <span className="ag_method_badge ag_method_badge--py">PY</span>
                <div className="ag_item__main">
                  <strong className="ag_mono">{fn.name}</strong>
                  <span className="ag_item__sub">{fn.parameters.length ? `(${fn.parameters.map((p) => p.name).join(", ")})` : "(no parameters)"} · timeout {Math.round(fn.timeout_ms / 1000)} s</span>
                  {fn.description && <span className="ag_muted ag_small">{fn.description}</span>}
                </div>
                {fn.secrets.length > 0 && <span className="ag_chip" title="Has secrets"><Lock size={12} /> {fn.secrets.length} secret{fn.secrets.length === 1 ? "" : "s"}</span>}
                {code?.canWrite && (
                  <>
                    <Toggle label={fn.enabled ? "Disable function" : "Enable function"} checked={fn.enabled} disabled={busy === `code:${fn.id}`} onChange={(v) => run(`code:${fn.id}`, async () => replaceCode(await agentsApi.updateCodeFunction(detail.id, fn.id, { enabled: v, secrets: fn.secrets })))} />
                    <button type="button" className="ag_icon_btn" aria-label={`Edit ${fn.name}`} onClick={() => setCodeDialog({ open: true, fn })}><Pencil size={15} /></button>
                  </>
                )}
                <button type="button" className="ag_icon_btn ag_icon_btn--danger" aria-label={`Delete ${fn.name}`} onClick={() => setConfirm({ kind: "code", id: fn.id, name: fn.name })}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="ag_section">
        <div className="ag_section__head">
          <div>
            <h2 className="ag_section__title">MCP servers</h2>
            <p className="ag_muted ag_small">Plug in ready-made tool servers. Pick exactly which tools the agent can use.</p>
          </div>
          <Button variant="primary" onClick={() => setMcpDialog(true)}><Plug size={15} /> Connect server</Button>
        </div>
        {detail.mcpServers.length === 0 ? (
          <button type="button" className="ag_placeholder" onClick={() => setMcpDialog(true)}>
            <Plug size={18} /> <span><strong>No MCP servers yet</strong> — DeepWiki is a free one to try.</span>
          </button>
        ) : (
          <div className="ag_list">
            {detail.mcpServers.map((s) => {
              const on = s.tools.filter((t) => t.enabled).length;
              const open = expanded === s.id;
              return (
                <div key={s.id} className="ag_item ag_item--stack">
                  <div className="ag_item__row">
                    <span className="ag_mcp_badge"><Plug size={15} /></span>
                    <div className="ag_item__main">
                      <strong>{s.name}</strong>
                      <span className="ag_item__sub ag_mono">{s.url}</span>
                    </div>
                    {s.hasToken && <span className="ag_chip"><Lock size={12} /> token</span>}
                    <button type="button" className="ag_chip ag_chip--button" onClick={() => { setExpanded(open ? null : s.id); setToolQuery(""); }} aria-expanded={open}>
                      {on}/{s.tools.length} tools <ChevronDown size={13} className={open ? "ag_rot" : ""} />
                    </button>
                    <button type="button" className="ag_icon_btn" aria-label="Refresh tool list" title="Refresh tool list" disabled={busy === `refresh:${s.id}`} onClick={() => run(`refresh:${s.id}`, async () => replaceMcp(await agentsApi.refreshMcp(detail.id, s.id)))}>
                      <RefreshCw size={15} className={busy === `refresh:${s.id}` ? "spin" : ""} />
                    </button>
                    <button type="button" className="ag_icon_btn" aria-label={`Edit ${s.name}`} title="Edit name, URL or token" onClick={() => setEditingMcp(s)}>
                      <Pencil size={15} />
                    </button>
                    <button type="button" className="ag_icon_btn ag_icon_btn--danger" aria-label={`Remove ${s.name}`} onClick={() => setConfirm({ kind: "mcp", id: s.id, name: s.name })}><Trash2 size={15} /></button>
                  </div>
                  {open && (() => {
                    const q = toolQuery.trim().toLowerCase();
                    const shown = q ? s.tools.filter((t) => `${t.name} ${t.description ?? ""}`.toLowerCase().includes(q)) : s.tools;
                    return (
                    <div className="ag_mcp_tools">
                      <div className="ag_mcp_tools__bar">
                        {s.tools.length > 6 && (
                          <label className="ag_search"><Search size={14} /><input value={toolQuery} onChange={(e) => setToolQuery(e.target.value)} placeholder="Filter tools" aria-label={`Filter ${s.name} tools`} /></label>
                        )}
                        <span className="ag_muted ag_small">{on} of {s.tools.length} on{q ? ` · ${shown.length} shown` : ""}</span>
                        <div className="ag_mcp_tools__bulk">
                          <Button variant="ghost" disabled={busy === `mcp:${s.id}` || shown.every((t) => t.enabled)} onClick={() => setMcpTools(s, shown.map((t) => t.name), true)}>{q ? "Turn shown on" : "All on"}</Button>
                          <Button variant="ghost" disabled={busy === `mcp:${s.id}` || shown.every((t) => !t.enabled)} onClick={() => setMcpTools(s, shown.map((t) => t.name), false)}>{q ? "Turn shown off" : "All off"}</Button>
                        </div>
                      </div>
                      {shown.length === 0 && <span className="ag_muted ag_small">No tools match “{toolQuery}”.</span>}
                      {shown.map((t) => (
                        <div key={t.name} className="ag_mcp_tool">
                          <div>
                            <strong className="ag_mono">{t.name}</strong>
                            {t.description && <span className="ag_muted ag_small">{t.description}</span>}
                          </div>
                          <Toggle label={`${t.enabled ? "Disable" : "Enable"} ${t.name}`} checked={t.enabled} disabled={busy === `mcp:${s.id}`} onChange={(v) => toggleMcpTool(s, t.name, v)} />
                        </div>
                      ))}
                    </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {fnDialog.open && (
        <FunctionDialog agentId={detail.id} initial={fnDialog.fn} onClose={() => setFnDialog({ open: false })} onSaved={(fn) => { replaceFn(fn); setFnDialog({ open: false }); }} />
      )}
      {codeDialog.open && (
        <CodeFunctionDialog agentId={detail.id} initial={codeDialog.fn} onClose={() => setCodeDialog({ open: false })} onSaved={(fn) => { replaceCode(fn); setCodeDialog({ open: false }); }} />
      )}
      {editingMcp && (
        <McpEditDialog agentId={detail.id} server={editingMcp} onClose={() => setEditingMcp(null)}
          onSaved={(s) => { replaceMcp(s); setEditingMcp(null); setExpanded(s.id); }} />
      )}
      {mcpDialog && <McpDialog agentId={detail.id} onClose={() => setMcpDialog(false)} onAdded={(s) => { replaceMcp(s); setMcpDialog(false); setExpanded(s.id); }} />}
      {confirm && (
        <ConfirmDialog
          title={confirm.kind === "mcp" ? `Disconnect ${confirm.name}?` : `Delete ${confirm.name}?`}
          message={confirm.kind === "mcp" ? "The agent loses access to all of this server's tools." : "The agent will no longer be able to call this function."}
          confirmLabel={confirm.kind === "mcp" ? "Disconnect" : "Delete function"}
          busy={busy === "delete"}
          onConfirm={doDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
};

// ── Schedules ────────────────────────────────────────────────────────────
const SchedulesTab = ({ detail, setDetail, whatsappLinked, email }: { detail: AgentDetail; setDetail: (d: AgentDetail) => void; whatsappLinked: boolean; email?: AgentCatalog["email"] }) => {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<{ open: boolean; schedule?: Schedule }>({ open: false });
  const [confirm, setConfirm] = useState<Schedule | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const replace = (s: Schedule) => setDetail({ ...detail, schedules: detail.schedules.some((x) => x.id === s.id) ? detail.schedules.map((x) => (x.id === s.id ? s : x)) : [...detail.schedules, s] });

  const act = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const statusBadge = (s: Schedule) => {
    if (!s.last_status) return <span className="ag_status">Not run yet</span>;
    const label = { running: "Running", succeeded: "Last run OK", failed: "Last run failed" }[s.last_status];
    return <span className={`ag_status ag_status--${s.last_status}`}>{label}</span>;
  };

  return (
    <div className="ag_tab_body">
      <ErrorNote message={error} />
      {notice && <div className="ag_notice">{notice}</div>}
      <section className="ag_section">
        <div className="ag_section__head">
          <div>
            <h2 className="ag_section__title">Schedules</h2>
            <p className="ag_muted ag_small">Run this agent automatically. Each schedule keeps its results in its own chat.</p>
          </div>
          <Button variant="primary" onClick={() => setDialog({ open: true })}><Plus size={15} /> New schedule</Button>
        </div>

        {detail.schedules.length === 0 ? (
          <button type="button" className="ag_placeholder" onClick={() => setDialog({ open: true })}>
            <CalendarClock size={18} /> <span><strong>Nothing scheduled</strong> — e.g. a daily briefing at 9:00 sent to your WhatsApp or email.</span>
          </button>
        ) : (
          <div className="ag_list">
            {detail.schedules.map((s) => (
              <div key={s.id} className={`ag_item ag_item--stack ${s.enabled ? "" : "is_off"}`}>
                <div className="ag_item__row">
                  <span className="ag_sched_badge"><Clock size={15} /></span>
                  <div className="ag_item__main">
                    <strong>{s.name}</strong>
                    <span className="ag_item__sub">{s.summary}{s.deliver_whatsapp && " · → WhatsApp"}{s.deliver_email && s.email_to?.length > 0 && ` · → Email (${s.email_to.length === 1 ? s.email_to[0] : `${s.email_to.length} people`})`}</span>
                  </div>
                  {statusBadge(s)}
                  <Toggle label={s.enabled ? "Pause schedule" : "Resume schedule"} checked={s.enabled} disabled={busy === `toggle:${s.id}`} onChange={(v) => act(`toggle:${s.id}`, async () => replace(await agentsApi.updateSchedule(detail.id, s.id, { enabled: v })))} />
                </div>
                <p className="ag_sched_prompt">“{s.prompt}”</p>
                <div className="ag_item__row ag_item__row--meta">
                  <span className="ag_muted ag_small">
                    {s.enabled ? <>Next run <strong title={fmtDate(s.next_run_at)}>{relative(s.next_run_at)}</strong></> : <><Pause size={12} /> Paused</>}
                    {s.last_run_at && <> · Last run {relative(s.last_run_at)}</>}
                  </span>
                  <div className="ag_item__actions">
                    <Button variant="ghost" busy={busy === `run:${s.id}`} onClick={() => act(`run:${s.id}`, async () => {
                      await agentsApi.runSchedule(detail.id, s.id);
                      replace({ ...s, last_status: "running" });
                      setNotice(`“${s.name}” started — results appear in its chat and the Activity tab in a moment.`);
                    })}><Play size={14} /> Run now</Button>
                    {s.session_id && <Button variant="ghost" onClick={() => navigate(`/chathome?session=${s.session_id}`)}><ExternalLink size={14} /> Open chat</Button>}
                    <button type="button" className="ag_icon_btn" aria-label={`Edit ${s.name}`} onClick={() => setDialog({ open: true, schedule: s })}><Pencil size={15} /></button>
                    <button type="button" className="ag_icon_btn ag_icon_btn--danger" aria-label={`Delete ${s.name}`} onClick={() => setConfirm(s)}><Trash2 size={15} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {dialog.open && (
        <ScheduleDialog
          agentId={detail.id}
          agentName={detail.name}
          initial={dialog.schedule}
          whatsappLinked={whatsappLinked}
          email={email}
          onClose={() => setDialog({ open: false })}
          onSaved={(s) => { replace(s); setDialog({ open: false }); }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={`Delete “${confirm.name}”?`}
          message="It stops running. Its past results stay in the chat history."
          confirmLabel="Delete schedule"
          busy={busy === "delete"}
          onCancel={() => setConfirm(null)}
          onConfirm={() => act("delete", async () => {
            await agentsApi.deleteSchedule(detail.id, confirm.id);
            setDetail({ ...detail, schedules: detail.schedules.filter((x) => x.id !== confirm.id) });
            setConfirm(null);
          })}
        />
      )}
    </div>
  );
};

// ── Activity ─────────────────────────────────────────────────────────────
const ActivityTab = ({ agentId }: { agentId: string }) => {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<AgentRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const refresh = useCallback(() => {
    agentsApi.runs(agentId).then(setRuns).catch((e) => setError(e.message));
  }, [agentId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <div className="ag_tab_body">
      <ErrorNote message={error} />
      <section className="ag_section">
        <div className="ag_section__head">
          <div>
            <h2 className="ag_section__title">Recent runs</h2>
            <p className="ag_muted ag_small">Scheduled and “Run now” executions. Refreshes automatically.</p>
          </div>
          <Button variant="ghost" onClick={refresh}><RefreshCw size={14} /> Refresh</Button>
        </div>
        {runs === null && <p className="ag_muted">Loading…</p>}
        {runs?.length === 0 && <p className="ag_muted">No runs yet. Create a schedule and press “Run now” to try it.</p>}
        {!!runs?.length && (
          <div className="ag_runs">
            {runs.map((r) => {
              const secs = r.finished_at ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000) : null;
              return (
                <div key={r.id} className="ag_run">
                  <button type="button" className="ag_run__head" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                    <span className={`ag_status ag_status--${r.status}`}>{r.status === "running" ? "Running" : r.status === "succeeded" ? "Succeeded" : "Failed"}</span>
                    <strong>{r.schedule_name ?? "Manual run"}</strong>
                    <span className="ag_muted ag_small">{fmtDate(r.started_at)}{secs !== null && ` · ${secs}s`}</span>
                    <ChevronDown size={15} className={open === r.id ? "ag_rot" : ""} />
                  </button>
                  {open === r.id && (
                    <div className="ag_run__body">
                      {r.error && <div className="ag_error">{r.error}</div>}
                      {r.output && <MarkdownOutput text={r.output} />}
                      {r.session_id && <Button variant="ghost" onClick={() => navigate(`/chathome?session=${r.session_id}`)}><ExternalLink size={14} /> Open full chat</Button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
