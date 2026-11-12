import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { Field } from "@/shared/ui/ui";
import type { FlowNode, Route, Rule, RuleOp } from "@/features/pipelines/api/pipelines_api";
import { newRoute, outputRefs, RULE_LABEL, type StepNode } from "@/features/pipelines/lib/flow_graph";

type RouterNode = Extract<FlowNode, { type: "router" }>;

const MAX_ROUTES = 10;
const MAX_RULES = 10;
const OPS: RuleOp[] = [
  "contains", "not_contains", "equals", "starts_with", "ends_with", "one_of", "matches",
  "number_gt", "number_gte", "number_lt", "number_lte", "number_between",
  "is_empty", "not_empty", "exists", "not_exists",
];
const NO_VALUE: RuleOp[] = ["is_empty", "not_empty", "exists", "not_exists"];

const placeholder = (op: RuleOp) =>
  op.startsWith("number") ? "50000" : op === "matches" ? "INV-\\d+" : op === "one_of" ? "low, medium, high" : "urgent";

// "Look at": the previous output, the run's input, or an earlier agent's output.
export const SourceSelect = ({ value, before, onChange }: { value: string; before: StepNode[]; onChange: (v: string) => void }) => (
  <Field label="Look at">
    <select className="ag_input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="previous">Previous step's output</option>
      <option value="input">The run's input</option>
      {outputRefs(before).map((o) => <option key={o.ref} value={o.ref}>Output of “{o.label}”</option>)}
    </select>
  </Field>
);

// One check: optional JSON field, operator, value (two boxes for a range).
export const RuleRow = ({ rule, onChange, onRemove }: { rule: Rule; onChange: (r: Rule) => void; onRemove?: () => void }) => {
  const [lo, hi] = rule.op === "number_between" ? (rule.value.split("..").concat("") as [string, string]) : ["", ""];
  const needsField = rule.op === "exists" || rule.op === "not_exists";
  return (
    <div className="wf_rule2">
      <input className={`ag_input wf_rule2__field ${needsField && !rule.field ? "is_missing" : ""}`} value={rule.field ?? ""} maxLength={100}
        placeholder={needsField ? "JSON field (required)" : "Whole text"} aria-label="JSON field (optional)"
        title="Optional: a JSON field in the output, e.g. status, order.total or items[0].sku. Leave empty to check the whole text."
        onChange={(e) => onChange({ ...rule, field: e.target.value.trim() || undefined })} />
      <select className="ag_input" value={rule.op} aria-label="Rule"
        onChange={(e) => { const op = e.target.value as RuleOp; onChange({ ...rule, op, value: NO_VALUE.includes(op) ? "" : op === "number_between" || rule.op === "number_between" ? "" : rule.value }); }}>
        {OPS.map((op) => <option key={op} value={op}>{RULE_LABEL[op]}</option>)}
      </select>
      {rule.op === "number_between" ? (
        <div className="wf_range">
          <input className="ag_input" inputMode="decimal" value={lo} placeholder="min" aria-label="Minimum" onChange={(e) => onChange({ ...rule, value: `${e.target.value.replace(/[^\d.,-]/g, "")}..${hi}` })} />
          <span className="ag_muted">to</span>
          <input className="ag_input" inputMode="decimal" value={hi} placeholder="max" aria-label="Maximum" onChange={(e) => onChange({ ...rule, value: `${lo}..${e.target.value.replace(/[^\d.,-]/g, "")}` })} />
        </div>
      ) : NO_VALUE.includes(rule.op) ? <span /> : (
        <input className="ag_input" value={rule.value} maxLength={500} placeholder={placeholder(rule.op)} aria-label="Value" onChange={(e) => onChange({ ...rule, value: e.target.value })} />
      )}
      {onRemove ? <button type="button" className="ag_icon_btn" aria-label="Remove rule" onClick={onRemove}><X size={14} /></button> : <span />}
    </div>
  );
};

// Router: routes checked top to bottom (first match wins) or picked by AI;
// Otherwise catches the rest. Every route gets its own output on the canvas.
export const RouterEditor = ({ node, before, onChange }: { node: RouterNode; before: StepNode[]; onChange: (n: RouterNode) => void }) => {
  const setRoute = (i: number, r: Route) => onChange({ ...node, routes: node.routes.map((x, j) => (j === i ? r : x)) });
  const move = (i: number, d: -1 | 1) => {
    const routes = [...node.routes];
    [routes[i], routes[i + d]] = [routes[i + d], routes[i]];
    onChange({ ...node, routes });
  };
  const nextNumber = () => {
    let n = node.routes.length + 1;
    while (node.routes.some((r) => r.label.toLowerCase() === `route ${n}`)) n++;
    return n;
  };
  const labels = node.routes.map((r) => r.label.trim().toLowerCase());

  return (
    <>
      <div className="sk_modes" role="radiogroup" aria-label="How to route">
        <label className={`sk_mode ${node.mode === "rule" ? "is_on" : ""}`}>
          <input type="radio" checked={node.mode === "rule"} onChange={() => onChange({ ...node, mode: "rule", routes: node.routes.map((r) => (r.when.rules.length ? r : { ...r, when: { match: "all", rules: [{ op: "contains", value: "" }] } })) })} /> Rules
        </label>
        <label className={`sk_mode ${node.mode === "ai" ? "is_on" : ""}`}>
          <input type="radio" checked={node.mode === "ai"} onChange={() => onChange({ ...node, mode: "ai" })} /> AI picks a route
        </label>
      </div>
      <SourceSelect value={node.source} before={before} onChange={(source) => onChange({ ...node, source })} />

      <ol className="wf_routes">
        {node.routes.map((r, i) => {
          const dup = r.label.trim() && labels.filter((l) => l === r.label.trim().toLowerCase()).length > 1;
          const reserved = ["otherwise", "none"].includes(r.label.trim().toLowerCase());
          return (
            <li key={r.id} className="wf_route">
              <div className="wf_route__head">
                <span className="wf_route__n">{i + 1}</span>
                <input className={`ag_input ${dup || reserved || !r.label.trim() ? "is_missing" : ""}`} value={r.label} maxLength={40} placeholder="Route name" aria-label="Route name"
                  onChange={(e) => setRoute(i, { ...r, label: e.target.value })} />
                <button type="button" className="ag_icon_btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
                <button type="button" className="ag_icon_btn" aria-label="Move down" disabled={i === node.routes.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
                <button type="button" className="ag_icon_btn" aria-label="Delete route" disabled={node.routes.length === 1} onClick={() => onChange({ ...node, routes: node.routes.filter((x) => x.id !== r.id) })}><Trash2 size={14} /></button>
              </div>
              {(dup || reserved) && <div className="ag_small mk_bad">{dup ? "Two routes have this name." : "That name is reserved."}</div>}

              {node.mode === "rule" ? (
                <>
                  <div className="wf_route__match">
                    Match
                    <select className="ag_input" value={r.when.match} aria-label="Match" onChange={(e) => setRoute(i, { ...r, when: { ...r.when, match: e.target.value as "all" | "any" } })}>
                      <option value="all">all</option>
                      <option value="any">any</option>
                    </select>
                    of these rules
                  </div>
                  {r.when.rules.map((rule, k) => (
                    <RuleRow key={k} rule={rule}
                      onChange={(nr) => setRoute(i, { ...r, when: { ...r.when, rules: r.when.rules.map((x, j) => (j === k ? nr : x)) } })}
                      onRemove={r.when.rules.length > 1 ? () => setRoute(i, { ...r, when: { ...r.when, rules: r.when.rules.filter((_, j) => j !== k) } }) : undefined} />
                  ))}
                  {r.when.rules.length < MAX_RULES && (
                    <button type="button" className="wf_link_btn" onClick={() => setRoute(i, { ...r, when: { ...r.when, rules: [...r.when.rules, { op: "contains", value: "" }] } })}><Plus size={13} /> Add rule</button>
                  )}
                </>
              ) : (
                <textarea className="ag_input" rows={2} value={r.description ?? ""} maxLength={300} placeholder="When to pick it, e.g. “invoices, refunds, payment problems”"
                  aria-label="When to pick this route" onChange={(e) => setRoute(i, { ...r, description: e.target.value })} />
              )}
            </li>
          );
        })}
        <li className="wf_route wf_route--default">
          <div className="wf_route__head"><span className="wf_route__n">∗</span><strong>Otherwise</strong></div>
          <span className="ag_muted ag_small">{node.mode === "rule" ? "When no route matches." : "When the AI finds no route fits, or its answer is unclear."}</span>
        </li>
      </ol>
      {node.routes.length < MAX_ROUTES && (
        <button type="button" className="ag_btn ag_btn--ghost wf_add_route" onClick={() => onChange({ ...node, routes: [...node.routes, newRoute(nextNumber(), node.mode)] })}><Plus size={14} /> Add route</button>
      )}

      {node.mode === "ai" && (
        <Field label="Extra guidance (optional)" hint="Shared rules for the AI, e.g. “Anything mentioning a lawyer goes to Escalate”. You can use {{input}}.">
          <textarea className="ag_input" rows={2} value={node.instructions ?? ""} maxLength={1000} onChange={(e) => onChange({ ...node, instructions: e.target.value || undefined })} />
        </Field>
      )}
      <p className="ag_muted ag_small">
        {node.mode === "rule"
          ? <>Routes are checked from the top; the first match wins. Tip: ask the previous agent to answer in JSON — e.g. <code>{'{"category": "billing", "priority": "high"}'}</code> — and check fields like <code>category</code>.</>
          : <>Uses your default model. Clear route names and descriptions give the best results. A model error fails the step, so a run is never routed silently.</>}
        {" "}Connect every route and <strong>Otherwise</strong> to a next step; routes can join up again later.
      </p>
    </>
  );
};
