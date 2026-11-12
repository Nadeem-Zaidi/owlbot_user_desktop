import { useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { FlaskConical, KeyRound, Plus, Terminal, Trash2 } from "lucide-react";
import { agentsApi } from "@/features/agents/api/agents_api";
import type { CodeFunction, CodeFunctionDraft, CodeSecret, FunctionParam, RunPythonResult } from "@/features/agents/types";
import { SECRET_MASK } from "@/features/agents/types";
import { Button, ErrorNote, Field, Modal } from "@/shared/ui/ui";

const TEMPLATE = `def run(args, secrets):
    """Called by the agent with the parameters below as \`args\`.
    Return anything JSON-serialisable — the agent sees what you return."""
    import json, urllib.request

    # Example: fetch JSON and summarise it, so the model only sees the summary.
    # req = urllib.request.Request(args["url"], headers={"Authorization": f"Bearer {secrets['API_KEY']}"})
    # rows = json.load(urllib.request.urlopen(req, timeout=20))
    # return {"count": len(rows), "total": sum(r["total"] for r in rows)}

    return {"hello": args.get("name", "world")}
`;

const BLANK: CodeFunctionDraft = {
  name: "",
  description: "",
  code: TEMPLATE,
  parameters: [{ name: "name", type: "string", required: false, description: "Who to greet" }],
  secrets: [],
  timeout_ms: 15000,
  enabled: true,
};

// The endpoints the dialog uses; provider agents pass their own.
export type CodeFunctionApi = Pick<typeof agentsApi, "testCodeFunction" | "createCodeFunction" | "updateCodeFunction">;

export const CodeFunctionDialog = ({ agentId, initial, onSaved, onClose, api = agentsApi }: {
  agentId: string;
  initial?: CodeFunction;
  onSaved: (fn: CodeFunction) => void;
  onClose: () => void;
  api?: CodeFunctionApi;
}) => {
  const [fn, setFn] = useState<CodeFunctionDraft>(initial ? { ...initial } : BLANK);
  const [args, setArgs] = useState<Record<string, string>>({});
  const [test, setTest] = useState<RunPythonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const set = <K extends keyof CodeFunctionDraft>(key: K, value: CodeFunctionDraft[K]) => setFn((f) => ({ ...f, [key]: value }));
  const setParam = (i: number, patch: Partial<FunctionParam>) => set("parameters", fn.parameters.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const setSecret = (i: number, patch: Partial<CodeSecret>) => set("secrets", fn.secrets.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const typedArgs = () => {
    const out: Record<string, unknown> = {};
    for (const p of fn.parameters) {
      const raw = args[p.name];
      if (raw === undefined || raw === "") continue;
      if (p.type === "number" || p.type === "integer") out[p.name] = Number(raw);
      else if (p.type === "boolean") out[p.name] = raw === "true";
      else out[p.name] = raw;
    }
    return out;
  };

  const runTest = async () => {
    setTesting(true);
    setError(null);
    setTest(null);
    try {
      setTest(await api.testCodeFunction(agentId, fn, typedArgs(), initial?.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't run the function");
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      onSaved(initial ? await api.updateCodeFunction(agentId, initial.id, fn) : await api.createCodeFunction(agentId, fn));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
      setSaving(false);
    }
  };

  return (
    <Modal
      wide
      title={initial ? `Edit ${initial.name}` : "Write a Python function"}
      subtitle="The agent calls run(args, secrets) when it needs this function. It runs in your Python service — it can use the network and any installed package."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} busy={saving} disabled={!fn.name || !fn.code.trim()}>{initial ? "Save changes" : "Add function"}</Button>
        </>
      }
    >
      <div className="ag_row ag_row--2">
        <Field label="Name" hint="Letters, numbers and _ — e.g. summarise_costs">
          <input className="ag_input ag_mono" value={fn.name} onChange={(e) => set("name", e.target.value.replace(/[^a-zA-Z0-9_]/g, "_"))} placeholder="summarise_costs" />
        </Field>
        <Field label="Timeout" hint="Stopped if it runs longer (1–120 s)">
          <div className="ag_inline">
            <input className="ag_input ag_input--narrow" type="number" min={1} max={120} value={Math.round(fn.timeout_ms / 1000)} onChange={(e) => set("timeout_ms", Math.max(1, Math.min(120, Number(e.target.value) || 1)) * 1000)} />
            <span className="ag_muted">seconds</span>
          </div>
        </Field>
      </div>

      <Field label="When should the agent use it?" hint="The model reads this to decide — be specific about what it returns.">
        <textarea className="ag_input" rows={2} value={fn.description} onChange={(e) => set("description", e.target.value)} placeholder="Downloads the cost estimates and returns totals per category, the cheapest vendor and outliers." />
      </Field>

      <div className="ag_subsection">
        <span className="ag_field__label">Code</span>
        <div className="ag_code">
          <CodeMirror
            value={fn.code}
            height="300px"
            extensions={[python()]}
            onChange={(v) => set("code", v)}
            basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
          />
        </div>
        <span className="ag_field__hint">Must define <code>def run(args, secrets):</code> (or <code>async def</code>). Anything you <code>print()</code> shows up in the test output.</span>
      </div>

      <div className="ag_subsection">
        <div className="ag_subsection__head">
          <span className="ag_field__label">Parameters <span className="ag_muted ag_small">— what the agent passes in <code>args</code></span></span>
          <Button variant="ghost" onClick={() => set("parameters", [...fn.parameters, { name: "", type: "string", required: false, description: "" }])}><Plus size={14} /> Add</Button>
        </div>
        {fn.parameters.length === 0 && <p className="ag_muted ag_small">No parameters — <code>args</code> will be empty.</p>}
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
          <span className="ag_field__label"><KeyRound size={14} /> Secrets <span className="ag_muted ag_small">— read with <code>secrets["NAME"]</code>; encrypted, never shown to the model</span></span>
          <Button variant="ghost" onClick={() => set("secrets", [...fn.secrets, { key: "", value: "" }])}><Plus size={14} /> Add</Button>
        </div>
        {fn.secrets.map((s, i) => (
          <div key={i} className="ag_header_row">
            <input className="ag_input ag_mono" placeholder="API_KEY" value={s.key} onChange={(e) => setSecret(i, { key: e.target.value.replace(/[^A-Za-z0-9_]/g, "_") })} />
            <input className="ag_input ag_mono" type="password" autoComplete="new-password" placeholder="value" value={s.value} onFocus={() => s.value === SECRET_MASK && setSecret(i, { value: "" })} onChange={(e) => setSecret(i, { value: e.target.value })} />
            <span />
            <button type="button" className="ag_icon_btn" aria-label="Remove secret" onClick={() => set("secrets", fn.secrets.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>

      <div className="ag_test">
        <div className="ag_subsection__head">
          <span className="ag_field__label"><FlaskConical size={14} /> Try it</span>
          <Button onClick={runTest} busy={testing} disabled={!fn.code.trim() || !fn.name}><Terminal size={14} /> Run</Button>
        </div>
        {fn.parameters.filter((p) => p.name).length > 0 && (
          <div className="ag_test__args">
            {fn.parameters.filter((p) => p.name).map((p) => (
              <input key={p.name} className="ag_input" placeholder={`${p.name}${p.required ? " *" : ""}`} value={args[p.name] ?? ""} onChange={(e) => setArgs((a) => ({ ...a, [p.name]: e.target.value }))} />
            ))}
          </div>
        )}
        {test && (
          <div className={`ag_test__result ${test.ok ? "is_ok" : "is_bad"}`}>
            <div className="ag_test__status">{test.ok ? "Returned" : "Failed"} · {test.durationMs} ms</div>
            {test.ok
              ? <pre>{JSON.stringify(test.result, null, 2)?.slice(0, 6000) ?? "None"}</pre>
              : <pre className="ag_test__error">{test.error}</pre>}
            {test.stdout && (
              <>
                <span className="ag_field__label">Printed output</span>
                <pre>{test.stdout.slice(-4000)}</pre>
              </>
            )}
          </div>
        )}
      </div>

      <ErrorNote message={error} />
    </Modal>
  );
};
