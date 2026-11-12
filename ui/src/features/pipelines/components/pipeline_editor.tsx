import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, Check, CheckCircle2, ChevronDown, Circle, Copy, GitFork, LoaderCircle, MinusCircle, Play, Plus, Trash2, XCircle } from "lucide-react";
import { loadStepAgents, providerLabel, stepKey, type StepAgent } from "@/features/pipelines/api/pipeline_agents";
import { pipelinesApi, type PipelineInput, type PipelineRun, type StepRunStatus } from "@/features/pipelines/api/pipelines_api";
import { AgentAvatar } from "@/shared/ui/agent_avatar";
import { Button, ErrorNote } from "@/shared/ui/ui";
import { MarkdownOutput } from "@/features/chat/components/markdown_output";

const EMPTY: PipelineInput = { name: "", description: "", steps: [] };

const StatusIcon = ({ status }: { status: StepRunStatus }) => {
  switch (status) {
    case "running": return <LoaderCircle size={18} className="spin pl_st--running" />;
    case "succeeded": return <CheckCircle2 size={18} className="pl_st--ok" />;
    case "failed": return <XCircle size={18} className="pl_st--bad" />;
    case "skipped": return <MinusCircle size={18} className="pl_st--skip" />;
    default: return <Circle size={18} className="pl_st--skip" />;
  }
};

const fmtTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const secs = (a?: string, b?: string) => (a && b ? `${Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000))}s` : "");

export const PipelineEditor = () => {
  const { id: routeId } = useParams();
  const isNew = !routeId || routeId === "new";
  const navigate = useNavigate();

  const [agents, setAgents] = useState<StepAgent[]>([]);
  const [form, setForm] = useState<PipelineInput>(EMPTY);
  const [saved, setSaved] = useState<PipelineInput>(EMPTY);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const [input, setInput] = useState("");
  const [active, setActive] = useState<PipelineRun | null>(null);
  const [openStep, setOpenStep] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareas = useRef<(HTMLTextAreaElement | null)[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const list = await loadStepAgents();
        setAgents(list);
        if (isNew) {
          const pick = list.find((a) => a.active);
          const first: PipelineInput = { ...EMPTY, steps: pick ? [{ kind: pick.kind, agent_id: pick.id, instruction: "{{input}}" }] : [] };
          setForm(first);
          return;
        }
        const d = await pipelinesApi.getPipeline(routeId!);
        if (d.is_workflow) {
          navigate(`/pipelines/${routeId}/flow`, { replace: true });
          return;
        }
        const f = { name: d.name, description: d.description, steps: d.steps };
        setForm(f);
        setSaved(f);
        setRuns(d.runs);
        setActive(d.runs[0] ?? null);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Couldn't load the pipeline");
      }
    })();
  }, [isNew, routeId, navigate]);

  // Poll the active run until it finishes.
  const activeId = active?.id;
  const activeRunning = active?.status === "running";
  useEffect(() => {
    if (!activeId || !activeRunning) return;
    const t = setInterval(async () => {
      try {
        const r = await pipelinesApi.getRun(activeId);
        setActive(r);
        setRuns((list) => list.map((x) => (x.id === r.id ? r : x)));
      } catch {
        // keep polling
      }
    }, 1500);
    return () => clearInterval(t);
  }, [activeId, activeRunning]);

  const byKey = useMemo(() => new Map(agents.map((a) => [stepKey({ kind: a.kind, agent_id: a.id }), a])), [agents]);
  const regular = agents.filter((a) => a.kind === "agent");
  const nativeGroups = (["anthropic", "openai"] as const)
    .map((p) => ({ provider: p, list: agents.filter((a) => a.kind === "native" && a.provider === p) }))
    .filter((g) => g.list.length > 0)
    .sort((x, y) => Number(y.list[0].active) - Number(x.list[0].active)); // switched-on provider first
  const firstActive = agents.find((a) => a.active);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const setStep = (i: number, patch: Partial<PipelineInput["steps"][number]>) =>
    setForm((f) => ({ ...f, steps: f.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const move = (i: number, d: -1 | 1) =>
    setForm((f) => {
      const steps = [...f.steps];
      [steps[i], steps[i + d]] = [steps[i + d], steps[i]];
      return { ...f, steps };
    });

  const insert = (i: number, token: string) => {
    const el = textareas.current[i];
    const text = form.steps[i].instruction;
    const at = el ? el.selectionStart : text.length;
    setStep(i, { instruction: text.slice(0, at) + token + text.slice(el ? el.selectionEnd : at) });
    requestAnimationFrame(() => el?.focus());
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const created = await pipelinesApi.create(form);
        navigate(`/pipelines/${created.id}`, { replace: true });
        return;
      }
      await pipelinesApi.update(routeId!, form);
      setSaved(form);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const start = useCallback(async () => {
    if (!routeId || isNew) return;
    setStarting(true);
    setError(null);
    try {
      const run = await pipelinesApi.run(routeId, input);
      setActive(run);
      setRuns((list) => [run, ...list]);
      setOpenStep(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the run");
    } finally {
      setStarting(false);
    }
  }, [routeId, isNew, input]);

  if (loadError) {
    return (
      <div className="ag_page">
        <div className="ag_error">{loadError}</div>
        <Button onClick={() => navigate("/pipelines")}><ArrowLeft size={15} /> Back to pipelines</Button>
      </div>
    );
  }

  return (
    <div className="ag_page ag_page--editor">
      <header className="ag_editor_head">
        <button type="button" className="ag_back" onClick={() => navigate("/pipelines")}><ArrowLeft size={16} /> Pipelines</button>
        <div className="ag_editor_head__title">
          <h1>{isNew ? "New pipeline" : form.name || "Untitled pipeline"}</h1>
        </div>
        {!isNew && (
          <Button onClick={() => navigate(`/pipelines/${routeId}/flow`)} disabled={dirty} title={dirty ? "Save your changes first" : "Open in the visual editor to add conditions, branches and approvals"}>
            <GitFork size={15} /> Convert to workflow
          </Button>
        )}
      </header>

      <div className="pl_layout">
        <div className="pl_builder">
          <section className="ag_section">
            <input className="ag_input ag_input--title" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Pipeline name" maxLength={80} />
            <input className="ag_input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does it produce? (optional)" maxLength={300} />
          </section>

          <div className="pl_flow">
            <div className="pl_endpoint"><span className="pl_endpoint__dot" /> Pipeline input — <code>{"{{input}}"}</code></div>
            {form.steps.map((s, i) => {
              const a = byKey.get(stepKey(s));
              return (
                <div key={i} className="pl_step_wrap">
                  <div className="pl_connector"><ArrowDown size={16} /></div>
                  <section className="ag_section pl_step">
                    <div className="pl_step__head">
                      <span className="pl_step__num">{i + 1}</span>
                      <span className="pl_step__icon">{a ? <AgentAvatar icon={a.icon} /> : "❔"}</span>
                      <select
                        className="ag_input pl_step__agent"
                        value={stepKey(s)}
                        onChange={(e) => {
                          const [kind, ...rest] = e.target.value.split(":");
                          setStep(i, { kind: kind as "agent" | "native", agent_id: rest.join(":") });
                        }}
                      >
                        {!a && <option value={stepKey(s)}>Deleted agent — choose another</option>}
                        {regular.length > 0 && (
                          <optgroup label="Agents">
                            {regular.map((x) => <option key={x.id} value={`agent:${x.id}`}>{x.icon} {x.name}</option>)}
                          </optgroup>
                        )}
                        {nativeGroups.map((g) => (
                          <optgroup key={g.provider} label={`Provider agents · ${providerLabel(g.provider)}${g.list[0].active ? "" : " (switched off)"}`}>
                            {g.list.map((x) => (
                              <option key={x.id} value={`native:${x.id}`} disabled={!x.active && stepKey(s) !== `native:${x.id}`}>
                                {x.icon} {x.name}{x.active ? "" : ` — switch to ${providerLabel(x.provider)}`}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      {a?.kind === "native" && <span className={`na_badge na_badge--${a.provider} pl_step__badge`}>{providerLabel(a.provider)}</span>}
                      <div className="pl_step__tools">
                        <button type="button" className="ag_icon_btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
                        <button type="button" className="ag_icon_btn" aria-label="Move down" disabled={i === form.steps.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
                        <button type="button" className="ag_icon_btn ag_icon_btn--danger" aria-label="Remove step" onClick={() => setForm({ ...form, steps: form.steps.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
                      </div>
                    </div>
                    {a?.description && <p className="ag_muted ag_small pl_step__desc">{a.description}</p>}
                    {a && !a.active && (
                      <p className="ag_error pl_step__warn">This {providerLabel(a.provider)} agent is switched off — runs will stop here. Switch to {providerLabel(a.provider)} on Provider agents, or pick another agent.</p>
                    )}
                    <textarea
                      ref={(el) => { textareas.current[i] = el; }}
                      className="ag_input"
                      rows={3}
                      value={s.instruction}
                      onChange={(e) => setStep(i, { instruction: e.target.value })}
                      placeholder={i === 0 ? "e.g. Research this topic: {{input}}" : "e.g. Turn these notes into a one-page report: {{previous}}"}
                      maxLength={4000}
                    />
                    <div className="pl_tokens">
                      <span className="ag_muted ag_small">Insert:</span>
                      <button type="button" className="ag_chip ag_chip--button" onClick={() => insert(i, "{{input}}")}>{"{{input}}"} pipeline input</button>
                      {i > 0 && <button type="button" className="ag_chip ag_chip--button" onClick={() => insert(i, "{{previous}}")}>{"{{previous}}"} step {i}'s output</button>}
                      {!/\{\{\s*(input|previous)\s*\}\}/.test(s.instruction) && (
                        <span className="ag_muted ag_small">— {i === 0 ? "the pipeline input" : `step ${i}'s output`} is added at the end automatically</span>
                      )}
                    </div>
                  </section>
                </div>
              );
            })}
            <div className="pl_connector"><ArrowDown size={16} /></div>
            <button type="button" className="ag_placeholder pl_add" disabled={!firstActive || form.steps.length >= 10}
              onClick={() => firstActive && setForm({ ...form, steps: [...form.steps, { kind: firstActive.kind, agent_id: firstActive.id, instruction: form.steps.length ? "{{previous}}" : "{{input}}" }] })}>
              <Plus size={18} /> <span><strong>Add step</strong>{form.steps.length >= 10 ? " — 10 steps maximum" : ""}</span>
            </button>
            <div className="pl_endpoint"><span className="pl_endpoint__dot pl_endpoint__dot--end" /> Final output = the last step's answer</div>
          </div>
        </div>

        <aside className="pl_side">
          <section className="ag_section">
            <h2 className="ag_section__title">Run</h2>
            {isNew ? (
              <p className="ag_muted ag_small">Create the pipeline first, then run it here.</p>
            ) : (
              <>
                <textarea className="ag_input" rows={4} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Input for step 1 — e.g. a topic, a question, a URL, or pasted data" />
                <Button variant="primary" onClick={start} busy={starting} disabled={dirty || activeRunning} title={dirty ? "Save your changes first" : undefined}>
                  <Play size={15} /> {activeRunning ? "Running…" : "Run pipeline"}
                </Button>
                {dirty && <span className="ag_muted ag_small">Save your changes to run the updated pipeline.</span>}
              </>
            )}
          </section>

          {active && (
            <section className="ag_section pl_run">
              <div className="ag_section__head">
                <h2 className="ag_section__title">Run #{active.id}</h2>
                <span className={`ag_status ag_status--${active.status}`}>{active.status === "running" ? "Running" : active.status === "succeeded" ? "Succeeded" : "Failed"}</span>
              </div>
              {active.input && <p className="ag_muted ag_small pl_run__input">Input: “{active.input.slice(0, 160)}{active.input.length > 160 ? "…" : ""}”</p>}
              <ol className="pl_timeline">
                {active.steps.map((s, i) => (
                  <li key={i} className={`pl_tl pl_tl--${s.status}`}>
                    <button type="button" className="pl_tl__head" onClick={() => setOpenStep(openStep === i ? null : i)} disabled={!s.output && !s.error}>
                      <StatusIcon status={s.status} />
                      <span className="pl_tl__agent"><AgentAvatar icon={s.agent_icon} /> {s.agent_name}</span>
                      {s.kind === "native" && s.provider && <span className={`na_badge na_badge--${s.provider} pl_tl__badge`}>{providerLabel(s.provider)}</span>}
                      <span className="ag_muted ag_small">{secs(s.started_at, s.finished_at)}</span>
                      {(s.output || s.error) && <ChevronDown size={14} className={openStep === i ? "ag_rot" : ""} />}
                    </button>
                    {openStep === i && (
                      <div className="pl_tl__body">
                        {s.error && <div className="ag_error">{s.error}</div>}
                        {s.output && <MarkdownOutput text={s.output} />}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
              {active.status === "failed" && active.error && <div className="ag_error">{active.error}</div>}
              {active.output && (
                <div className="pl_final">
                  <div className="ag_section__head">
                    <span className="ag_field__label">Final output</span>
                    <Button variant="ghost" onClick={async () => { await navigator.clipboard.writeText(active.output ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                      {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                    </Button>
                  </div>
                  <MarkdownOutput text={active.output} className="pl_final__text" />
                </div>
              )}
            </section>
          )}

          {runs.length > 1 && (
            <section className="ag_section">
              <h2 className="ag_section__title">History</h2>
              <div className="pl_history">
                {runs.map((r) => (
                  <button key={r.id} type="button" className={`pl_history__item ${active?.id === r.id ? "is_active" : ""}`} onClick={() => { setActive(r); setOpenStep(null); }}>
                    <span className={`ag_status ag_status--${r.status}`}>{r.status === "running" ? "Running" : r.status === "succeeded" ? "OK" : "Failed"}</span>
                    <span className="ag_small">#{r.id} · {fmtTime(r.started_at)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>

      <div className={`ag_savebar ${dirty || isNew ? "is_visible" : ""}`}>
        <ErrorNote message={error} />
        <span className="ag_muted ag_small">{isNew ? "Add steps, then create the pipeline." : justSaved ? "Saved" : "You have unsaved changes"}</span>
        {!isNew && <Button variant="ghost" onClick={() => setForm(saved)} disabled={!dirty}>Discard</Button>}
        <Button variant="primary" onClick={save} busy={saving} disabled={!form.name.trim() || form.steps.length === 0 || (!isNew && !dirty)}>
          {justSaved ? <><Check size={15} /> Saved</> : isNew ? "Create pipeline" : "Save changes"}
        </Button>
      </div>
    </div>
  );
};
