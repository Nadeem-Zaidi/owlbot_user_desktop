import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CircleCheck, CircleAlert, ExternalLink, LoaderCircle, Pencil, PlugZap, Plus, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { DiscoverTab } from "@/features/marketplace/components/discover_tab";
import { Button, ConfirmDialog, ErrorNote, Field, Modal, Toggle } from "@/shared/ui/ui";
import {
  errorText, fmtLatency, fmtPer1M, fmtTokens, marketApi,
  type AdminCatalog, type AdminModel, type AdminOffer, type AdminProvider, type ProviderKind, type ProviderPreset,
} from "@/features/marketplace/api/market_api";

const KIND_LABEL: Record<ProviderKind, string> = { openai_compatible: "OpenAI-compatible", anthropic: "Anthropic (Claude)", openrouter: "OpenRouter" };
type Tab = "models" | "providers" | "discover";

// Owner only: the marketplace's own catalogue — your provider accounts, the
// models you sell, and which provider serves each model at what price.
export const CatalogAdminPage = () => {
  const [data, setData] = useState<AdminCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("models");

  const load = () => marketApi.adminCatalog().then(setData).catch((e) => setError(errorText(e)));
  useEffect(() => { void load(); }, []);

  return (
    <div className="ag_page mk_page">
      <header className="ag_page__header">
        <div>
          <h1 className="ag_page__title">Model catalogue</h1>
          <p className="ag_page__subtitle">
            Your provider accounts and the models you sell. Each model can have several providers — requests go to the first healthy one and fail over to the next.
          </p>
        </div>
        <div className="mk_range" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "models"} className={tab === "models" ? "is_on" : ""} onClick={() => setTab("models")}>Models{data ? ` (${data.models.length})` : ""}</button>
          <button type="button" role="tab" aria-selected={tab === "providers"} className={tab === "providers" ? "is_on" : ""} onClick={() => setTab("providers")}>Providers{data ? ` (${data.providers.length})` : ""}</button>
          <button type="button" role="tab" aria-selected={tab === "discover"} className={tab === "discover" ? "is_on" : ""} onClick={() => setTab("discover")}>
            Discover{data?.discoverCount ? <span className="mk_chip__n">{data.discoverCount}</span> : null}
          </button>
        </div>
      </header>
      <ErrorNote message={error} />
      {!data ? (
        !error && <div className="st_loading"><LoaderCircle size={18} className="spin" /> Loading…</div>
      ) : (
        <>
          <div className={`mk_health ${data.openrouterFallback && data.openrouterConfigured ? "" : "is_info"}`}>
            {data.openrouterFallback && data.openrouterConfigured ? <CircleCheck size={18} /> : <CircleAlert size={18} />}
            <div>
              <strong>{data.openrouterFallback && data.openrouterConfigured ? "OpenRouter fallback is on" : "Selling only your own catalogue"}</strong>
              <span>
                {data.openrouterFallback && data.openrouterConfigured
                  ? "Models you don't list here still come from OpenRouter, and it's the last resort if all your providers fail. Set MARKET_OPENROUTER_FALLBACK=false to turn it off."
                  : data.openrouterConfigured
                    ? "OpenRouter fallback is off (MARKET_OPENROUTER_FALLBACK=false)."
                    : "No OpenRouter key — customers see only the models listed here."}
              </span>
            </div>
          </div>
          {tab === "providers"
            ? <ProvidersTab data={data} onChange={load} setError={setError} />
            : tab === "discover"
              ? <DiscoverTab providers={data.providers} onChange={load} />
              : <ModelsTab data={data} onChange={load} setError={setError} goProviders={() => setTab("providers")} />}
        </>
      )}
    </div>
  );
};

// ── Providers ──
const ProvidersTab = ({ data, onChange, setError }: { data: AdminCatalog; onChange: () => void; setError: (e: string | null) => void }) => {
  const [editing, setEditing] = useState<AdminProvider | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminProvider | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, string>>({});

  const test = async (p: AdminProvider) => {
    setBusy(p.id);
    try {
      const r = await marketApi.testProvider(p.id);
      setTests((t) => ({ ...t, [p.id]: `✓ Connected — ${r.models.length} models available` }));
    } catch (e) {
      setTests((t) => ({ ...t, [p.id]: `✗ ${errorText(e)}` }));
    } finally {
      setBusy(null);
    }
  };
  const toggle = async (p: AdminProvider, enabled: boolean) => {
    setBusy(p.id);
    try { await marketApi.saveProvider(p.id, { enabled }); onChange(); } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!deleting) return;
    setBusy(deleting.id);
    try { await marketApi.deleteProvider(deleting.id); setDeleting(null); onChange(); } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  };

  return (
    <section className="ag_section">
      <div className="mk_api_head">
        <h2 className="mk_h2">Provider accounts</h2>
        <Button variant="primary" onClick={() => setEditing("new")}><Plus size={15} /> Add provider</Button>
      </div>
      <p className="ag_muted ag_small">Your accounts with model providers. Keys are encrypted and never shown again; customers never see them.</p>
      {data.providers.length ? (
        <div className="mk_table_wrap">
          <table className="mk_table">
            <thead><tr><th>Provider</th><th>Type</th><th>Key</th><th>Health (24h)</th><th className="is_num">Priority</th><th>Enabled</th><th /></tr></thead>
            <tbody>
              {data.providers.map((p) => (
                <tr key={p.id} className={p.enabled ? "" : "is_off"}>
                  <td>
                    <strong>{p.name}</strong>
                    <div className="ag_muted ag_small mk_mono">{p.baseUrl}</div>
                    {tests[p.id] && <div className={`ag_small ${tests[p.id].startsWith("✓") ? "mk_pos" : "mk_bad"}`}>{tests[p.id]}</div>}
                    {p.syncError && <div className="ag_small mk_bad"><CircleAlert size={12} /> Sync: {p.syncError}</div>}
                    {p.budgetUsd !== null && <div className="ag_muted ag_small">Budget alert at ${p.budgetUsd}/month</div>}
                  </td>
                  <td>{KIND_LABEL[p.kind]}</td>
                  <td><code className="mk_mono">{p.keyHint}</code>{p.region && <div className="ag_muted ag_small">{p.region}</div>}</td>
                  <td className="mk_nowrap">
                    {p.health && p.health.requests24h > 0 ? (
                      <>
                        <span className={`mk_dot mk_dot--${p.health.status}`} /> {p.health.uptime24h}% up · {fmtLatency(p.health.avgLatencyMs)}
                        <div className="ag_muted ag_small">{p.health.requests24h.toLocaleString()} requests</div>
                      </>
                    ) : <span className="ag_muted ag_small">No traffic yet</span>}
                  </td>
                  <td className="is_num">{p.priority}</td>
                  <td><Toggle checked={p.enabled} onChange={(v) => void toggle(p, v)} label={`Enable ${p.name}`} disabled={busy === p.id} /></td>
                  <td className="mk_nowrap">
                    <button type="button" className="mk_icon_btn" onClick={() => void test(p)} title="Test connection" aria-label={`Test ${p.name}`} disabled={busy === p.id}>{busy === p.id ? <LoaderCircle size={15} className="spin" /> : <PlugZap size={15} />}</button>
                    <button type="button" className="mk_icon_btn" onClick={() => setEditing(p)} title="Edit" aria-label={`Edit ${p.name}`}><Pencil size={15} /></button>
                    <button type="button" className="mk_icon_btn" onClick={() => setDeleting(p)} title="Delete" aria-label={`Delete ${p.name}`}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="ag_muted">No providers yet. Add your first account — e.g. DeepInfra for cheap open models, or OpenAI.</p>}
      {editing && <ProviderModal provider={editing === "new" ? null : editing} presets={data.presets} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChange(); }} />}
      {deleting && (
        <ConfirmDialog title={`Delete ${deleting.name}?`} message="Its offers are removed too; models only it served stop being available (unless another provider or OpenRouter serves them)."
          confirmLabel="Delete provider" onConfirm={() => void remove()} onCancel={() => setDeleting(null)} busy={busy === deleting.id} />
      )}
    </section>
  );
};

const ProviderModal = ({ provider, presets, onClose, onSaved }: { provider: AdminProvider | null; presets: ProviderPreset[]; onClose: () => void; onSaved: () => void }) => {
  const [preset, setPreset] = useState<ProviderPreset | null>(null);
  const [name, setName] = useState(provider?.name ?? "");
  const [kind, setKind] = useState<ProviderKind>(provider?.kind ?? "openai_compatible");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [region, setRegion] = useState(provider?.region ?? "");
  const [priority, setPriority] = useState(String(provider?.priority ?? 100));
  const [notes, setNotes] = useState(provider?.notes ?? "");
  const [budget, setBudget] = useState(provider?.budgetUsd ? String(provider.budgetUsd) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (p: ProviderPreset) => {
    setPreset(p);
    setName(p.name);
    setKind(p.kind);
    setBaseUrl(p.baseUrl);
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await marketApi.saveProvider(provider?.id ?? null, { name, kind, baseUrl, ...(apiKey ? { apiKey } : {}), region, priority: Number(priority) || 100, notes, budgetUsd: budget || null });
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal wide title={provider ? `Edit ${provider.name}` : "Add provider"} onClose={onClose} footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => void save()} busy={busy}>{provider ? "Save" : "Add provider"}</Button>
      </>
    }>
      <ErrorNote message={error} />
      {!provider && (
        <div className="mk_presets mk_presets--wrap">
          {presets.map((p) => (
            <button key={p.id} type="button" className={`mk_preset ${preset?.id === p.id ? "is_on" : ""}`} onClick={() => choose(p)}>{p.name}</button>
          ))}
        </div>
      )}
      <div className="mk_form2">
        <Field label="Name"><input className="ag_input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="DeepInfra" /></Field>
        <Field label="Type">
          <select className="ag_input" value={kind} onChange={(e) => setKind(e.target.value as ProviderKind)}>
            {(Object.keys(KIND_LABEL) as ProviderKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Base URL" hint="The provider's OpenAI-compatible endpoint (filled in by the preset).">
        <input className="ag_input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
      </Field>
      <Field label={provider ? "API key (leave empty to keep the current one)" : "API key"} hint={preset ? <a href={preset.keysUrl} target="_blank" rel="noreferrer" className="mk_link">Get a {preset.name} key <ExternalLink size={12} /></a> : undefined}>
        <input className="ag_input" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={provider ? provider.keyHint : "sk-…"} />
      </Field>
      <div className="mk_form2">
        <Field label="Region (optional)" hint="e.g. India — shown on model pages."><input className="ag_input" value={region} maxLength={40} onChange={(e) => setRegion(e.target.value)} /></Field>
        <Field label="Priority" hint="Lower is tried first when offers tie."><input className="ag_input" inputMode="numeric" value={priority} onChange={(e) => setPriority(e.target.value.replace(/[^\d-]/g, ""))} /></Field>
      </div>
      <div className="mk_form2">
        <Field label="Notes (optional)"><input className="ag_input" value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} placeholder="Billing account, contact, limits…" /></Field>
        <Field label="Monthly budget alert (USD, optional)" hint="Earnings warns as 30-day spend nears this — top up the provider in time."><input className="ag_input" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 50" /></Field>
      </div>
    </Modal>
  );
};

// ── Models & offers ──
const ModelsTab = ({ data, onChange, setError, goProviders }: { data: AdminCatalog; onChange: () => void; setError: (e: string | null) => void; goProviders: () => void }) => {
  const [editing, setEditing] = useState<AdminModel | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminModel | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const providerName = (id: string) => data.providers.find((p) => p.id === id)?.name ?? "?";

  const toggle = async (m: AdminModel, enabled: boolean) => {
    setBusy(m.id);
    try { await marketApi.saveModel({ id: m.id, enabled }, false); onChange(); } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!deleting) return;
    setBusy(deleting.id);
    try { await marketApi.deleteModel(deleting.id); setDeleting(null); onChange(); } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  };

  return (
    <section className="ag_section">
      <div className="mk_api_head">
        <h2 className="mk_h2">Models you sell</h2>
        <Button variant="primary" onClick={() => setEditing("new")} disabled={!data.providers.length}><Plus size={15} /> Add model</Button>
      </div>
      {!data.providers.length && <p className="ag_small mk_bad">Add a provider account first — <button type="button" className="mk_linkbtn" onClick={goProviders}>go to Providers</button>.</p>}
      {data.models.length ? (
        <div className="mk_table_wrap">
          <table className="mk_table">
            <thead><tr><th>Model</th><th>Served by</th><th className="is_num">Cheapest in / out per 1M</th><th className="is_num">Context</th><th>Enabled</th><th /></tr></thead>
            <tbody>
              {data.models.map((m) => {
                const live = m.offers.filter((o) => o.enabled);
                const cheapest = [...live].sort((a, b) => a.inputPerM + a.outputPerM - (b.inputPerM + b.outputPerM))[0];
                return (
                  <tr key={m.id} className={m.enabled ? "" : "is_off"}>
                    <td>
                      <strong>{m.name}</strong> {m.featured && <span className="mk_badge mk_badge--feat"><Sparkles size={11} /> Featured</span>} {m.indiaHosted && <span className="mk_badge">India</span>}
                      <div className="ag_muted ag_small mk_mono">{m.id}</div>
                    </td>
                    <td>
                      {live.length ? live.map((o) => providerName(o.providerId)).join(" → ") : <span className="mk_bad ag_small">No provider — not for sale</span>}
                      {m.offers.some((o) => o.missingUpstream) && <div className="ag_small mk_warn_text"><TriangleAlert size={12} /> A provider no longer lists this model</div>}
                    </td>
                    <td className="is_num">{cheapest ? `${fmtPer1M(cheapest.inputPerM)} / ${fmtPer1M(cheapest.outputPerM)}` : "—"}</td>
                    <td className="is_num">{fmtTokens(m.contextLength)}</td>
                    <td><Toggle checked={m.enabled} onChange={(v) => void toggle(m, v)} label={`Enable ${m.name}`} disabled={busy === m.id} /></td>
                    <td className="mk_nowrap">
                      <Link to={`/models/${m.id}`} className="mk_icon_btn" title="View in the marketplace"><ExternalLink size={15} /></Link>
                      <button type="button" className="mk_icon_btn" onClick={() => setEditing(m)} title="Edit" aria-label={`Edit ${m.name}`}><Pencil size={15} /></button>
                      <button type="button" className="mk_icon_btn" onClick={() => setDeleting(m)} title="Delete" aria-label={`Delete ${m.name}`}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="ag_muted">No models yet. Add one — e.g. <code>qwen/qwen3-32b</code> — and choose which of your providers serves it.</p>}
      {editing && (
        <ModelModal
          model={editing === "new" ? null : data.models.find((m) => m.id === editing.id) ?? editing}
          providers={data.providers}
          onClose={() => setEditing(null)}
          onChange={onChange}
        />
      )}
      {deleting && (
        <ConfirmDialog title={`Delete ${deleting.name}?`} message="It disappears from the marketplace (customers' chats on it fall back to their default model)."
          confirmLabel="Delete model" onConfirm={() => void remove()} onCancel={() => setDeleting(null)} busy={busy === deleting.id} />
      )}
    </section>
  );
};

const ModelModal = ({ model, providers, onClose, onChange }: { model: AdminModel | null; providers: AdminProvider[]; onClose: () => void; onChange: () => void }) => {
  const isNew = !model;
  const [id, setId] = useState(model?.id ?? "");
  const [savedId, setSavedId] = useState<string | null>(model?.id ?? null);
  const [form, setForm] = useState({
    name: model?.name ?? "", author: model?.author ?? "", description: model?.description ?? "",
    contextLength: model?.contextLength ? String(model.contextLength) : "", maxOutput: model?.maxOutput ? String(model.maxOutput) : "",
    tools: model?.tools ?? false, vision: model?.inputModalities?.includes("image") ?? false, reasoning: model?.reasoning ?? false,
    structuredOutput: model?.structuredOutput ?? false, featured: model?.featured ?? false, indiaHosted: model?.indiaHosted ?? false,
    huggingFaceId: model?.huggingFaceId ?? "",
  });
  const [offers, setOffers] = useState<AdminOffer[]>(model?.offers ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const prefill = async () => {
    setBusy("prefill");
    setError(null);
    setNotice(null);
    try {
      const { model: m } = await marketApi.prefill(id.trim());
      if (!m) { setNotice("OpenRouter doesn't list this id — fill in the details yourself."); return; }
      setForm((f) => ({
        ...f, name: m.name, author: m.author, description: m.description, contextLength: m.contextLength ? String(m.contextLength) : "",
        maxOutput: m.maxOutput ? String(m.maxOutput) : "", tools: m.tools, vision: m.inputModalities.includes("image"), reasoning: m.reasoning, structuredOutput: m.structuredOutput,
      }));
      setNotice(`Filled in from OpenRouter — upstream price there: ${fmtPer1M(m.price.input)} in / ${fmtPer1M(m.price.output)} out per 1M.`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  // Details from Hugging Face (open models): description, context, vision.
  const fillFromHf = async () => {
    setBusy("hf");
    setError(null);
    setNotice(null);
    try {
      const { model: m } = await marketApi.huggingFace(form.huggingFaceId.trim());
      if (!m) { setNotice("Hugging Face doesn't have that model id."); return; }
      setForm((f) => ({
        ...f, huggingFaceId: m.huggingFaceId, description: m.description || f.description,
        contextLength: m.contextLength ? String(m.contextLength) : f.contextLength, vision: m.vision || f.vision,
        name: f.name || m.huggingFaceId.split("/").pop() || f.name,
      }));
      setNotice(`Filled in from Hugging Face${m.license ? ` · licence: ${m.license}` : ""}${m.parameters ? ` · ${(m.parameters / 1e9).toFixed(1)}B parameters` : ""}.`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const saveDetails = async () => {
    setBusy("save");
    setError(null);
    try {
      const body = {
        id: id.trim(), name: form.name, author: form.author, description: form.description,
        contextLength: form.contextLength || null, maxOutput: form.maxOutput || null,
        inputModalities: form.vision ? ["text", "image"] : ["text"], tools: form.tools, reasoning: form.reasoning,
        structuredOutput: form.structuredOutput, featured: form.featured, indiaHosted: form.indiaHosted,
        huggingFaceId: form.huggingFaceId.trim() || null,
      };
      const saved = await marketApi.saveModel(body, isNew && !savedId);
      setSavedId(saved.id);
      setNotice(isNew && !savedId ? "Model saved — now add the provider(s) that serve it below." : "Saved.");
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal wide title={isNew ? "Add model" : `Edit ${model!.name}`} onClose={onClose} footer={
      <>
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button variant="primary" onClick={() => void saveDetails()} busy={busy === "save"} disabled={!id.trim()}>{savedId ? "Save details" : "Save model"}</Button>
      </>
    }>
      <ErrorNote message={error} />
      {notice && <div className="mk_notice">{notice}</div>}
      <div className="mk_form2 mk_form2--idrow">
        <Field label="Model id" hint={'What customers use, e.g. "qwen/qwen3-32b" (maker/model).'}>
          <input className="ag_input mk_mono" value={id} onChange={(e) => setId(e.target.value)} disabled={!!savedId} placeholder="maker/model-name" />
        </Field>
        <div className="mk_prefill">
          <Button onClick={() => void prefill()} busy={busy === "prefill"} disabled={!id.trim()}><Sparkles size={14} /> Fill from OpenRouter</Button>
        </div>
      </div>
      <div className="mk_form2">
        <Field label="Display name"><input className="ag_input" value={form.name} maxLength={120} onChange={(e) => set("name", e.target.value)} placeholder="Qwen3 32B" /></Field>
        <Field label="Maker"><input className="ag_input" value={form.author} maxLength={60} onChange={(e) => set("author", e.target.value)} placeholder="qwen" /></Field>
      </div>
      <div className="mk_form2 mk_form2--idrow">
        <Field label="Hugging Face id (open models, optional)" hint={'e.g. "Qwen/Qwen3-32B" — fills in the description and context length.'}>
          <input className="ag_input mk_mono" value={form.huggingFaceId} onChange={(e) => set("huggingFaceId", e.target.value)} placeholder="Org/Model" />
        </Field>
        <div className="mk_prefill">
          <Button onClick={() => void fillFromHf()} busy={busy === "hf"} disabled={!/^[\w.-]+\/[\w.-]+$/.test(form.huggingFaceId.trim())}>Fill from Hugging Face</Button>
        </div>
      </div>
      <Field label="Description"><textarea className="ag_input" rows={3} value={form.description} maxLength={2000} onChange={(e) => set("description", e.target.value)} /></Field>
      <div className="mk_form2">
        <Field label="Context (tokens)"><input className="ag_input" inputMode="numeric" value={form.contextLength} onChange={(e) => set("contextLength", e.target.value.replace(/\D/g, ""))} placeholder="131072" /></Field>
        <Field label="Max output (tokens)"><input className="ag_input" inputMode="numeric" value={form.maxOutput} onChange={(e) => set("maxOutput", e.target.value.replace(/\D/g, ""))} placeholder="16384" /></Field>
      </div>
      <div className="mk_checks">
        {([["tools", "Tool calling"], ["vision", "Vision (images)"], ["reasoning", "Reasoning"], ["structuredOutput", "JSON output"], ["featured", "Featured"], ["indiaHosted", "India-hosted"]] as const).map(([k, label]) => (
          <label key={k} className="mk_check"><input type="checkbox" checked={form[k] as boolean} onChange={(e) => set(k, e.target.checked)} /> {label}</label>
        ))}
      </div>

      <h3 className="mk_h3">Providers serving this model</h3>
      {!savedId ? <p className="ag_muted ag_small">Save the model first, then add its providers.</p> : (
        <OffersEditor modelId={savedId} offers={offers} setOffers={setOffers} providers={providers} onChange={onChange} />
      )}
    </Modal>
  );
};

type OfferDraft = { providerId: string; upstreamModel: string; inputPerM: string; outputPerM: string; cacheReadPerM: string; markupPct: string; priority: string; quantization: string; contextLength: string };
const emptyDraft = (providerId: string): OfferDraft => ({ providerId, upstreamModel: "", inputPerM: "", outputPerM: "", cacheReadPerM: "", markupPct: "", priority: "100", quantization: "", contextLength: "" });

const OffersEditor = ({ modelId, offers, setOffers, providers, onChange }: {
  modelId: string; offers: AdminOffer[]; setOffers: (fn: (o: AdminOffer[]) => AdminOffer[]) => void; providers: AdminProvider[]; onChange: () => void;
}) => {
  const [draft, setDraft] = useState<OfferDraft>(emptyDraft(providers[0]?.id ?? ""));
  const [suggest, setSuggest] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = (id: string) => providers.find((p) => p.id === id)?.name ?? "?";
  const sorted = useMemo(() => [...offers].sort((a, b) => a.priority - b.priority), [offers]);

  // Load the provider's model names for autocomplete (also proves the key works).
  // Fetched once per provider (an empty or failed answer is remembered too).
  useEffect(() => {
    const id = draft.providerId;
    if (!id || suggest[id] !== undefined) return;
    setSuggest((s) => ({ ...s, [id]: [] }));
    marketApi.testProvider(id)
      .then((r) => setSuggest((s) => ({ ...s, [id]: Array.isArray(r?.models) ? r.models : [] })))
      .catch(() => {});
  }, [draft.providerId, suggest]);

  const add = async () => {
    setBusy("add");
    setError(null);
    try {
      const o = await marketApi.saveOffer(null, {
        modelId, providerId: draft.providerId, upstreamModel: draft.upstreamModel.trim(), inputPerM: draft.inputPerM, outputPerM: draft.outputPerM,
        cacheReadPerM: draft.cacheReadPerM || null, markupPct: draft.markupPct || null, priority: Number(draft.priority) || 100,
        quantization: draft.quantization || null, contextLength: draft.contextLength || null,
      });
      setOffers((list) => [...list, o]);
      setDraft(emptyDraft(draft.providerId));
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const toggle = async (o: AdminOffer, enabled: boolean) => {
    setBusy(o.id);
    try {
      const u = await marketApi.saveOffer(o.id, { enabled });
      setOffers((list) => list.map((x) => (x.id === o.id ? u : x)));
      onChange();
    } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  };
  const remove = async (o: AdminOffer) => {
    setBusy(o.id);
    try {
      await marketApi.deleteOffer(o.id);
      setOffers((list) => list.filter((x) => x.id !== o.id));
      onChange();
    } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  };
  const d = (k: keyof OfferDraft, v: string) => setDraft((x) => ({ ...x, [k]: v }));
  const num = (v: string) => v.replace(/[^\d.]/g, "");

  return (
    <>
      <ErrorNote message={error} />
      {sorted.length ? (
        <div className="mk_table_wrap">
          <table className="mk_table">
            <thead><tr><th className="is_num">#</th><th>Provider</th><th>Provider's model name</th><th className="is_num">In /1M</th><th className="is_num">Out /1M</th><th className="is_num">Markup</th><th>On</th><th /></tr></thead>
            <tbody>
              {sorted.map((o, i) => (
                <tr key={o.id} className={o.enabled ? "" : "is_off"}>
                  <td className="is_num">{i + 1}</td>
                  <td>{name(o.providerId)}{o.missingUpstream && <div className="ag_small mk_warn_text"><TriangleAlert size={12} /> No longer listed</div>}</td>
                  <td><code className="mk_mono">{o.upstreamModel}</code></td>
                  <td className="is_num">{fmtPer1M(o.inputPerM)}</td>
                  <td className="is_num">{fmtPer1M(o.outputPerM)}</td>
                  <td className="is_num">{o.markupPct === null ? "default" : `${o.markupPct}%`}</td>
                  <td><Toggle checked={o.enabled} onChange={(v) => void toggle(o, v)} label="Enable offer" disabled={busy === o.id} /></td>
                  <td><button type="button" className="mk_icon_btn" onClick={() => void remove(o)} aria-label="Remove offer" disabled={busy === o.id}><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="ag_muted ag_small">No providers yet — this model isn't for sale until you add one.</p>}

      <div className="mk_offer_form">
        <div className="mk_form3">
          <Field label="Provider">
            <select className="ag_input" value={draft.providerId} onChange={(e) => d("providerId", e.target.value)}>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.enabled ? "" : " (off)"}</option>)}
            </select>
          </Field>
          <Field label="Provider's model name" hint={suggest[draft.providerId]?.length ? `${suggest[draft.providerId].length} names from this provider — start typing` : undefined}>
            <input className="ag_input mk_mono" list={`mk_suggest_${draft.providerId}`} value={draft.upstreamModel} onChange={(e) => d("upstreamModel", e.target.value)} placeholder="e.g. Qwen/Qwen3-32B" />
            <datalist id={`mk_suggest_${draft.providerId}`}>{(suggest[draft.providerId] ?? []).map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
          <Field label="Priority" hint="1 = tried first"><input className="ag_input" inputMode="numeric" value={draft.priority} onChange={(e) => d("priority", e.target.value.replace(/\D/g, ""))} /></Field>
        </div>
        <div className="mk_form3">
          <Field label="Your cost: input $/1M"><input className="ag_input" inputMode="decimal" value={draft.inputPerM} onChange={(e) => d("inputPerM", num(e.target.value))} placeholder="0.08" /></Field>
          <Field label="Your cost: output $/1M"><input className="ag_input" inputMode="decimal" value={draft.outputPerM} onChange={(e) => d("outputPerM", num(e.target.value))} placeholder="0.28" /></Field>
          <Field label="Markup % (optional)" hint="Empty = your default"><input className="ag_input" inputMode="decimal" value={draft.markupPct} onChange={(e) => d("markupPct", num(e.target.value))} placeholder="e.g. 15" /></Field>
        </div>
        <div className="mk_form3">
          <Field label="Cached input $/1M (optional)"><input className="ag_input" inputMode="decimal" value={draft.cacheReadPerM} onChange={(e) => d("cacheReadPerM", num(e.target.value))} /></Field>
          <Field label="Quantization (optional)"><input className="ag_input" value={draft.quantization} maxLength={20} onChange={(e) => d("quantization", e.target.value)} placeholder="fp8" /></Field>
          <Field label="Context at this provider (optional)"><input className="ag_input" inputMode="numeric" value={draft.contextLength} onChange={(e) => d("contextLength", e.target.value.replace(/\D/g, ""))} placeholder="40960" /></Field>
        </div>
        <Button onClick={() => void add()} busy={busy === "add"} disabled={!draft.providerId || !draft.upstreamModel.trim() || draft.inputPerM === "" || draft.outputPerM === ""}><Plus size={14} /> Add provider for this model</Button>
      </div>
    </>
  );
};
