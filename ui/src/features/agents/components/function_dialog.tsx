import { useState } from "react";
import { FlaskConical, Lock, Plus, Trash2 } from "lucide-react";
import { agentsApi } from "@/features/agents/api/agents_api";
import type { AgentFunction, FunctionDraft, FunctionHeader, FunctionParam, HttpTestResult } from "@/features/agents/types";
import { SECRET_MASK } from "@/features/agents/types";
import { Button, ErrorNote, Field, Modal } from "@/shared/ui/ui";

const BLANK: FunctionDraft = { name: "", description: "", method: "GET", url: "", parameters: [], headers: [], enabled: true };

// Starting points so a first function takes seconds, not minutes.
const PRESETS: { label: string; hint: string; fn: FunctionDraft }[] = [
  { label: "Blank", hint: "Start from scratch", fn: BLANK },
  {
    label: "Weather",
    hint: "Open-Meteo · no key needed",
    fn: {
      ...BLANK,
      name: "get_weather",
      description: "Gets the current weather for a location. Use it when the user asks about weather or temperature. Needs latitude and longitude.",
      url: "https://api.open-meteo.com/v1/forecast?current=temperature_2m,wind_speed_10m,weather_code&timezone=auto",
      parameters: [
        { name: "latitude", type: "number", required: true, description: "Latitude, e.g. 28.61 for New Delhi" },
        { name: "longitude", type: "number", required: true, description: "Longitude, e.g. 77.21 for New Delhi" },
      ],
    },
  },
  {
    label: "Webhook",
    hint: "POST JSON to your service",
    fn: {
      ...BLANK,
      name: "send_to_webhook",
      description: "Sends a message to my webhook. Use it when the user asks to notify or log something.",
      method: "POST",
      url: "https://example.com/webhook",
      parameters: [{ name: "message", type: "string", required: true, description: "What to send" }],
      headers: [{ key: "Authorization", value: "", secret: true }],
    },
  },
];

const placeholders = (url: string) => [...url.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)].map((m) => m[1]);

// The endpoints the dialog uses; provider agents pass their own.
export type FunctionApi = Pick<typeof agentsApi, "testFunction" | "createFunction" | "updateFunction">;

export const FunctionDialog = ({ agentId, initial, onSaved, onClose, api = agentsApi }: {
  agentId: string;
  initial?: AgentFunction;
  onSaved: (fn: AgentFunction) => void;
  onClose: () => void;
  api?: FunctionApi;
}) => {
  const [fn, setFn] = useState<FunctionDraft>(initial ? { ...initial } : PRESETS[0].fn);
  const [preset, setPreset] = useState(0);
  const [args, setArgs] = useState<Record<string, string>>({});
  const [test, setTest] = useState<HttpTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const set = <K extends keyof FunctionDraft>(key: K, value: FunctionDraft[K]) => setFn((f) => ({ ...f, [key]: value }));

  // Typing {city} in the URL adds a "city" parameter automatically.
  const setUrl = (url: string) => {
    setFn((f) => {
      const missing = placeholders(url).filter((p) => !f.parameters.some((x) => x.name === p));
      return { ...f, url, parameters: [...f.parameters, ...missing.map((name) => ({ name, type: "string" as const, required: true, description: "" }))] };
    });
  };

  const setParam = (i: number, patch: Partial<FunctionParam>) =>
    set("parameters", fn.parameters.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const setHeader = (i: number, patch: Partial<FunctionHeader>) =>
    set("headers", fn.headers.map((h, j) => (j === i ? { ...h, ...patch } : h)));

  const typedArgs = () => {
    const out: Record<string, unknown> = {};
    for (const p of fn.parameters) {
      const raw = args[p.name];
      if (raw === undefined || raw === "") continue;
      out[p.name] = p.type === "number" || p.type === "integer" ? Number(raw) : p.type === "boolean" ? raw === "true" : raw;
    }
    return out;
  };

  const runTest = async () => {
    setTesting(true);
    setError(null);
    setTest(null);
    try {
      setTest(await api.testFunction(agentId, fn, typedArgs(), initial?.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      onSaved(initial ? await api.updateFunction(agentId, initial.id, fn) : await api.createFunction(agentId, fn));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
      setSaving(false);
    }
  };

  const bodyLabel = ["POST", "PUT", "PATCH"].includes(fn.method) ? "a JSON body" : "the query string";

  return (
    <Modal
      wide
      title={initial ? `Edit ${initial.name}` : "Add a function"}
      subtitle="The agent calls this URL when it decides the function is useful. Describe clearly when to use it."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} busy={saving} disabled={!fn.name || !fn.url}>{initial ? "Save changes" : "Add function"}</Button>
        </>
      }
    >
      {!initial && (
        <div className="ag_presets">
          {PRESETS.map((p, i) => (
            <button key={p.label} type="button" className={`ag_preset ${preset === i ? "is_active" : ""}`} onClick={() => { setPreset(i); setFn(p.fn); setTest(null); setArgs({}); }}>
              <strong>{p.label}</strong>
              <span>{p.hint}</span>
            </button>
          ))}
        </div>
      )}

      <div className="ag_row">
        <Field label="Name" hint="Letters, numbers and _ — e.g. get_order_status">
          <input className="ag_input ag_mono" value={fn.name} onChange={(e) => set("name", e.target.value.replace(/[^a-zA-Z0-9_]/g, "_"))} placeholder="get_order_status" />
        </Field>
      </div>

      <Field label="When should the agent use it?" hint="This is what the model reads to decide — be specific.">
        <textarea className="ag_input" rows={2} value={fn.description} onChange={(e) => set("description", e.target.value)} placeholder="Looks up an order by its ID. Use it when the user asks where their order is." />
      </Field>

      <Field label="Request" hint={<>Use <code>{"{name}"}</code> for values in the URL. Other parameters are sent in {bodyLabel}.</>}>
        <div className="ag_url_row">
          <select className="ag_input ag_method" value={fn.method} onChange={(e) => set("method", e.target.value as FunctionDraft["method"])}>
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m}>{m}</option>)}
          </select>
          <input className="ag_input ag_mono" value={fn.url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/orders/{order_id}" />
        </div>
      </Field>

      <div className="ag_subsection">
        <div className="ag_subsection__head">
          <span className="ag_field__label">Parameters</span>
          <Button variant="ghost" onClick={() => set("parameters", [...fn.parameters, { name: "", type: "string", required: false, description: "" }])}><Plus size={14} /> Add</Button>
        </div>
        {fn.parameters.length === 0 && <p className="ag_muted ag_small">No parameters — the agent calls the URL as is.</p>}
        {fn.parameters.map((p, i) => (
          <div key={i} className="ag_param_row">
            <input className="ag_input ag_mono" placeholder="name" value={p.name} onChange={(e) => setParam(i, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "_") })} />
            <select className="ag_input" value={p.type} onChange={(e) => setParam(i, { type: e.target.value as FunctionParam["type"] })}>
              <option value="string">text</option>
              <option value="number">number</option>
              <option value="integer">whole number</option>
              <option value="boolean">yes / no</option>
            </select>
            <input className="ag_input" placeholder="What it means (helps the model)" value={p.description ?? ""} onChange={(e) => setParam(i, { description: e.target.value })} />
            <label className="ag_check"><input type="checkbox" checked={!!p.required} onChange={(e) => setParam(i, { required: e.target.checked })} /> required</label>
            <button type="button" className="ag_icon_btn" aria-label="Remove parameter" onClick={() => set("parameters", fn.parameters.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>

      <div className="ag_subsection">
        <div className="ag_subsection__head">
          <span className="ag_field__label">Headers</span>
          <Button variant="ghost" onClick={() => set("headers", [...fn.headers, { key: "", value: "", secret: false }])}><Plus size={14} /> Add</Button>
        </div>
        {fn.headers.length === 0 && <p className="ag_muted ag_small">Add an Authorization header if the API needs a key.</p>}
        {fn.headers.map((h, i) => (
          <div key={i} className="ag_header_row">
            <input className="ag_input ag_mono" placeholder="Authorization" value={h.key} onChange={(e) => setHeader(i, { key: e.target.value })} />
            <input
              className="ag_input ag_mono"
              type={h.secret ? "password" : "text"}
              placeholder={h.secret ? "Bearer sk-…" : "value"}
              value={h.value}
              onFocus={() => h.secret && h.value === SECRET_MASK && setHeader(i, { value: "" })}
              onChange={(e) => setHeader(i, { value: e.target.value })}
            />
            <label className="ag_check" title="Encrypted on the server and never shown again"><input type="checkbox" checked={h.secret} onChange={(e) => setHeader(i, { secret: e.target.checked })} /> <Lock size={12} /> secret</label>
            <button type="button" className="ag_icon_btn" aria-label="Remove header" onClick={() => set("headers", fn.headers.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>

      <div className="ag_test">
        <div className="ag_subsection__head">
          <span className="ag_field__label"><FlaskConical size={14} /> Try it</span>
          <Button onClick={runTest} busy={testing} disabled={!fn.url || !fn.name}>Send test request</Button>
        </div>
        {fn.parameters.length > 0 && (
          <div className="ag_test__args">
            {fn.parameters.filter((p) => p.name).map((p) => (
              <input key={p.name} className="ag_input" placeholder={`${p.name}${p.required ? " *" : ""}`} value={args[p.name] ?? ""} onChange={(e) => setArgs((a) => ({ ...a, [p.name]: e.target.value }))} />
            ))}
          </div>
        )}
        {test && (
          <div className={`ag_test__result ${test.ok ? "is_ok" : "is_bad"}`}>
            <div className="ag_test__status">HTTP {test.status} · {test.durationMs} ms</div>
            <pre>{(typeof test.body === "string" ? test.body : JSON.stringify(test.body, null, 2)).slice(0, 4000)}</pre>
          </div>
        )}
      </div>

      <ErrorNote message={error} />
    </Modal>
  );
};
