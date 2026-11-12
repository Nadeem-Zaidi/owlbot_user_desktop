import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, KeyRound, LoaderCircle, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, ErrorNote, Field, Modal, Toggle } from "@/shared/ui/ui";
import {
  COMPATIBLE_PRESETS, KEY_LINKS, MODELS_CHANGED, settingsApi,
  type LLMKey, type LLMKeyInput, type LLMKeyKind,
} from "@/features/settings/api/settings_api";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const KIND_OPTIONS: { id: LLMKeyKind; label: string; hint: string }[] = [
  { id: "openai", label: "OpenAI", hint: "GPT models — every feature, including code interpreter" },
  { id: "anthropic", label: "Anthropic", hint: "Claude models" },
  { id: "openai_compatible", label: "OpenAI-compatible", hint: "OpenRouter, Groq, DeepSeek, Mistral, Together, Ollama…" },
];

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
const changed = () => window.dispatchEvent(new Event(MODELS_CHANGED));

// Users' own model API keys (BYOK). Chats on these keys don't count toward
// the plan; the user pays their provider directly.
export const ApiKeysPage = () => {
  const [keys, setKeys] = useState<LLMKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LLMKey | "new" | null>(null);
  const [deleting, setDeleting] = useState<LLMKey | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => settingsApi.listKeys().then((r) => setKeys(r.keys)).catch((e) => setError(errorText(e)));
  useEffect(() => { void load(); }, []);

  const toggle = async (k: LLMKey, enabled: boolean) => {
    setBusyId(k.id);
    setError(null);
    try {
      const updated = await settingsApi.updateKey(k.id, { enabled });
      setKeys((list) => list?.map((x) => (x.id === k.id ? updated : x)) ?? null);
      changed();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await settingsApi.deleteKey(deleting.id);
      setKeys((list) => list?.filter((x) => x.id !== deleting.id) ?? null);
      setDeleting(null);
      changed();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="ag_page st_page">
      <header className="ag_page__header">
        <div>
          <h1 className="ag_page__title">API keys</h1>
          <p className="ag_page__subtitle">
            Use your own OpenAI, Claude, OpenRouter, Groq or other keys — any number of models.
            Chats on your own key <strong>don't count toward your plan</strong>; your provider bills you directly.
          </p>
        </div>
        <Button variant="primary" onClick={() => setEditing("new")}><Plus size={15} /> Add key</Button>
      </header>

      <ErrorNote message={error} />

      {keys === null ? (
        <div className="st_loading"><LoaderCircle size={18} className="spin" /> Loading…</div>
      ) : keys.length === 0 ? (
        <div className="st_empty">
          <KeyRound size={22} />
          <div>
            <strong>No keys yet</strong>
            <p className="ag_muted">Add a key and its models appear in the chat's model picker, in agents and on WhatsApp (/model).</p>
          </div>
          <Button variant="primary" onClick={() => setEditing("new")}><Plus size={15} /> Add your first key</Button>
        </div>
      ) : (
        <ul className="st_keys">
          {keys.map((k) => (
            <li key={k.id} className={`st_key ${k.enabled ? "" : "is_off"}`}>
              <div className="st_key__main">
                <div className="st_key__title">
                  <strong>{k.label}</strong>
                  <span className="ag_chip">{k.kindLabel}</span>
                  <code className="st_key__hint">{k.keyHint}</code>
                </div>
                {k.baseUrl && <div className="st_key__url ag_mono ag_small">{k.baseUrl}</div>}
                <div className="st_key__models">
                  {k.models.slice(0, 6).map((m) => (
                    <span key={m} className={`st_model ${m === k.defaultModel ? "is_default" : ""}`} title={m === k.defaultModel ? "Default model" : undefined}>{m}</span>
                  ))}
                  {k.models.length > 6 && <span className="st_model st_model--more">+{k.models.length - 6} more</span>}
                </div>
                <div className="st_key__status ag_small">
                  {k.lastError ? (
                    <span className="st_bad"><AlertTriangle size={13} /> {k.lastError}</span>
                  ) : (
                    <span className="st_ok"><CheckCircle2 size={13} /> Verified {fmtDate(k.lastVerifiedAt)}</span>
                  )}
                </div>
              </div>
              <div className="st_key__actions">
                <Toggle checked={k.enabled} onChange={(v) => void toggle(k, v)} label={k.enabled ? "On" : "Off"} disabled={busyId === k.id} />
                <button type="button" className="ag_icon_btn" aria-label={`Edit ${k.label}`} onClick={() => setEditing(k)}><Pencil size={15} /></button>
                <button type="button" className="ag_icon_btn ag_icon_btn--danger" aria-label={`Delete ${k.label}`} onClick={() => setDeleting(k)}><Trash2 size={15} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="st_help ag_small ag_muted">
        <p><strong>How it works.</strong> Your key is encrypted on the server and never shown again (only its last 4 characters).
          It's used only for chats where you pick one of its models. Usage still appears on the Usage page, marked as your key.</p>
      </section>

      {editing && (
        <KeyDialog
          existing={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setKeys((list) => {
              const rest = (list ?? []).filter((x) => x.id !== saved.id);
              return editing === "new" ? [...rest, saved] : (list ?? []).map((x) => (x.id === saved.id ? saved : x));
            });
            setEditing(null);
            changed();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.label}"?`}
          message="Chats and agents using its models switch to the server's default model. This can't be undone."
          confirmLabel="Delete key"
          onConfirm={() => void remove()}
          onCancel={() => setDeleting(null)}
          busy={busyId === deleting.id}
        />
      )}
    </div>
  );
};

// ── add / edit dialog ─────────────────────────────────────────────────────
const KeyDialog = ({ existing, onClose, onSaved }: { existing: LLMKey | null; onClose: () => void; onSaved: (k: LLMKey) => void }) => {
  const initialPreset = existing?.baseUrl ? COMPATIBLE_PRESETS.find((p) => p.baseUrl === existing.baseUrl)?.id ?? "custom" : "openrouter";
  const [kind, setKind] = useState<LLMKeyKind>(existing?.kind ?? "openai");
  const [preset, setPreset] = useState(initialPreset);
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? COMPATIBLE_PRESETS[0].baseUrl);
  const [label, setLabel] = useState(existing?.label ?? "My OpenAI");
  const [labelTouched, setLabelTouched] = useState(!!existing);
  const [apiKey, setApiKey] = useState("");
  const [available, setAvailable] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string[]>(existing?.models ?? []);
  const [defaultModel, setDefaultModel] = useState(existing?.defaultModel ?? "");
  const [filter, setFilter] = useState("");
  const [manual, setManual] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const presetInfo = COMPATIBLE_PRESETS.find((p) => p.id === preset);
  const keyLink = kind === "openai_compatible" ? presetInfo?.keyUrl : KEY_LINKS[kind];
  // Name follows the provider until the user types their own.
  const suggestName = (k: LLMKeyKind, p: string) =>
    k === "openai" ? "My OpenAI" : k === "anthropic" ? "My Claude" : `My ${COMPATIBLE_PRESETS.find((x) => x.id === p)?.label.replace(/ \(.*\)$/, "") ?? "provider"}`;

  const changeKind = (k: LLMKeyKind) => {
    setKind(k);
    setAvailable(null);
    if (!existing) setSelected([]);
    if (!labelTouched) setLabel(suggestName(k, preset));
  };
  const changePreset = (p: string) => {
    setPreset(p);
    const info = COMPATIBLE_PRESETS.find((x) => x.id === p);
    if (info && info.baseUrl) setBaseUrl(info.baseUrl);
    if (p === "custom") setBaseUrl("");
    setAvailable(null);
    if (!labelTouched) setLabel(suggestName(kind, p));
  };

  const connection = (): Partial<LLMKeyInput> & { id?: string } => ({
    kind,
    ...(kind === "openai_compatible" ? { baseUrl: baseUrl.trim() } : {}),
    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    ...(existing && !apiKey.trim() ? { id: existing.id } : {}),
  });

  const loadModels = async () => {
    setTesting(true);
    setError(null);
    try {
      const r = await settingsApi.testKey(connection());
      setAvailable(r.models);
      if (!r.models.length) setError("The key works, but the provider didn't list any models — add model ids below.");
    } catch (e) {
      setError(errorText(e));
      setAvailable(null);
    } finally {
      setTesting(false);
    }
  };

  const toggleModel = (m: string) => setSelected((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));
  const visible = useMemo(() => (available ?? []).filter((m) => m.toLowerCase().includes(filter.toLowerCase())), [available, filter]);
  const addManual = () => {
    const ids = manual.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    if (ids.length) setSelected((s) => [...new Set([...s, ...ids])]);
    setManual("");
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const body: LLMKeyInput = {
      kind,
      label: label.trim(),
      models: selected,
      defaultModel: selected.includes(defaultModel) ? defaultModel : selected[0] ?? null,
      ...(kind === "openai_compatible" ? { baseUrl: baseUrl.trim() } : {}),
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    };
    try {
      onSaved(existing ? await settingsApi.updateKey(existing.id, body) : await settingsApi.createKey(body));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const canTest = (kind !== "openai_compatible" || !!baseUrl.trim()) && (!!apiKey.trim() || !!existing || kind === "openai_compatible");
  const canSave = !!label.trim() && selected.length > 0 && (!!existing || !!apiKey.trim() || kind === "openai_compatible") && !saving;

  return (
    <Modal
      wide
      title={existing ? `Edit "${existing.label}"` : "Add an API key"}
      subtitle="Your key is checked with the provider, then stored encrypted."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} disabled={!canSave} busy={saving}>{existing ? "Save changes" : "Save key"}</Button>
        </>
      }
    >
      <div className="st_form">
        <Field label="Provider">
          <div className="st_kinds" role="radiogroup" aria-label="Provider">
            {KIND_OPTIONS.map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={kind === o.id} className={`st_kind ${kind === o.id ? "is_active" : ""}`} onClick={() => changeKind(o.id)}>
                <strong>{o.label}</strong>
                <span>{o.hint}</span>
              </button>
            ))}
          </div>
        </Field>

        {kind === "openai_compatible" && (
          <div className="ag_row ag_row--2">
            <Field label="Service">
              <select id="st_preset" className="ag_input" value={preset} onChange={(e) => changePreset(e.target.value)}>
                {COMPATIBLE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="Base URL" hint="Ends with /v1 for most services">
              <input id="st_base" className="ag_input ag_mono" value={baseUrl} placeholder="https://…/v1" onChange={(e) => { setBaseUrl(e.target.value); setPreset("custom"); setAvailable(null); }} />
            </Field>
          </div>
        )}

        <div className="ag_row ag_row--2">
          <Field label="Name" hint="Shown in the model picker">
            <input id="st_label" className="ag_input" value={label} maxLength={60} onChange={(e) => { setLabel(e.target.value); setLabelTouched(true); }} />
          </Field>
          <Field
            label="API key"
            hint={keyLink ? <a href={keyLink} target="_blank" rel="noreferrer">Get a key <ExternalLink size={11} /></a> : kind === "openai_compatible" ? "Leave empty for a local server without a key" : undefined}
          >
            <input
              id="st_key"
              className="ag_input ag_mono"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              placeholder={existing ? `${existing.keyHint} saved — leave empty to keep` : kind === "anthropic" ? "sk-ant-…" : "sk-…"}
              onChange={(e) => { setApiKey(e.target.value); setAvailable(null); }}
            />
          </Field>
        </div>

        <div className="st_models">
          <div className="st_models__head">
            <span className="ag_field__label">Models <span className="ag_muted ag_small">— {selected.length} selected</span></span>
            <Button onClick={() => void loadModels()} disabled={!canTest || testing} busy={testing}>
              {available ? "Reload models" : "Check key & load models"}
            </Button>
          </div>

          {available && available.length > 0 && (
            <>
              <div className="st_search">
                <Search size={14} />
                <input id="st_filter" className="ag_input" placeholder={`Search ${available.length} models`} value={filter} onChange={(e) => setFilter(e.target.value)} />
                <button type="button" className="st_link" onClick={() => setSelected((s) => [...new Set([...s, ...visible])])}>Select shown</button>
                <button type="button" className="st_link" onClick={() => setSelected((s) => s.filter((m) => !visible.includes(m)))}>Clear shown</button>
              </div>
              <div className="st_model_list" role="group" aria-label="Available models">
                {visible.slice(0, 500).map((m) => (
                  <label key={m} className="st_model_opt">
                    <input type="checkbox" checked={selected.includes(m)} onChange={() => toggleModel(m)} />
                    <span className="ag_mono">{m}</span>
                  </label>
                ))}
                {visible.length === 0 && <p className="ag_muted ag_small">No models match "{filter}".</p>}
              </div>
            </>
          )}

          <div className="st_manual">
            <input
              id="st_manual"
              className="ag_input ag_mono"
              placeholder="Add a model id, e.g. meta-llama/llama-3.3-70b-instruct"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManual(); } }}
            />
            <Button onClick={addManual} disabled={!manual.trim()}><Plus size={14} /> Add</Button>
          </div>

          {selected.length > 0 && (
            <div className="st_selected">
              {selected.map((m) => (
                <span key={m} className={`st_model ${m === (defaultModel || selected[0]) ? "is_default" : ""}`}>
                  <button type="button" className="st_model__pick" title="Make default" onClick={() => setDefaultModel(m)}>{m}</button>
                  <button type="button" className="st_model__x" aria-label={`Remove ${m}`} onClick={() => toggleModel(m)}>×</button>
                </span>
              ))}
              <p className="ag_muted ag_small">Click a model to make it the default (highlighted).</p>
            </div>
          )}
        </div>

        <ErrorNote message={error} />
      </div>
    </Modal>
  );
};
