import { useState } from "react";
import { Globe, KeyRound, LoaderCircle, Monitor } from "lucide-react";
import { nativeAgentsApi } from "@/features/native_agents/api/native_agents_api";

// Mirrors the backend's ApprovalRequest (OpenAI computer use).
export type BrowserApprovalRequest =
  | { kind: "origin"; requestId: string; origin: string; reason: string | null }
  | {
      kind: "signin";
      requestId: string;
      origin: string | null;
      reason: string | null;
      fields: { id: string; label: string; required: boolean; type: string }[];
      options: { id: string; label: string; field_ids: string[] }[];
    };

export type BrowserApproval = { request: BrowserApprovalRequest; outcome?: string };

const host = (origin: string | null) => {
  if (!origin) return "this site";
  try { return new URL(origin).host; } catch { return origin; }
};

// The agent's hosted browser is paused, waiting for this answer.
export const BrowserApprovalCard = ({ approval }: { approval: BrowserApproval }) => {
  const { request, outcome } = approval;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [option, setOption] = useState(request.kind === "signin" ? request.options[0]?.id ?? "" : "");
  const done = outcome ?? sent;

  const answer = async (body: Record<string, unknown>, label: string) => {
    setBusy(true);
    setError(null);
    try {
      await nativeAgentsApi.answerApproval(request.requestId, body);
      setSent(label);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your answer");
    } finally {
      setBusy(false);
    }
  };

  if (request.kind === "origin") {
    return (
      <div className={`br_approval ${done ? "is_done" : ""}`} role="group" aria-label="Browser permission">
        <span className="br_approval__icon"><Globe size={16} /></span>
        <div className="br_approval__body">
          <strong>The agent's browser wants to open <code>{host(request.origin)}</code></strong>
          {request.reason && <span className="ag_muted ag_small">{request.reason}</span>}
          {error && <span className="br_approval__error">{error}</span>}
        </div>
        {done ? (
          <span className="br_approval__outcome">{done}</span>
        ) : (
          <div className="br_approval__actions">
            <button type="button" className="ag_btn ag_btn--ghost" disabled={busy} onClick={() => answer({ decision: "deny" }, "denied")}>Deny</button>
            <button type="button" className="ag_btn ag_btn--primary" disabled={busy} onClick={() => answer({ decision: "approve" }, "allowed")}>
              {busy && <LoaderCircle size={14} className="spin" />} Allow
            </button>
          </div>
        )}
      </div>
    );
  }

  const activeIds = request.options.length ? new Set(request.options.find((o) => o.id === option)?.field_ids ?? []) : null;
  const fields = request.fields.filter((f) => !activeIds || activeIds.has(f.id));
  const submit = () =>
    answer(
      { fields: fields.map((f) => ({ field_id: f.id, value: values[f.id] ?? "" })), ...(request.options.length ? { selected_option: option } : {}) },
      "signed in",
    );

  return (
    <div className={`br_approval br_approval--form ${done ? "is_done" : ""}`} role="group" aria-label="Browser sign-in">
      <span className="br_approval__icon"><KeyRound size={16} /></span>
      <div className="br_approval__body">
        <strong>Sign in to <code>{host(request.origin)}</code> for the agent</strong>
        {request.reason && <span className="ag_muted ag_small">{request.reason}</span>}
        {done ? (
          <span className="br_approval__outcome">{done}</span>
        ) : (
          <form className="br_approval__form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            {request.options.length > 1 && (
              <select className="ag_input" value={option} onChange={(e) => setOption(e.target.value)} aria-label="Sign-in method">
                {request.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            )}
            {fields.map((f) => (
              <label key={f.id} className="ag_field">
                <span className="ag_field__label">{f.label}{f.required ? "" : " (optional)"}</span>
                <input
                  className="ag_input"
                  type={f.type === "password" ? "password" : f.type === "email" ? "email" : "text"}
                  autoComplete={f.type === "password" ? "current-password" : f.type === "email" ? "username" : "off"}
                  required={f.required}
                  value={values[f.id] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                />
              </label>
            ))}
            <span className="ag_muted ag_small">Typed straight into the agent's browser at OpenAI — Owl doesn't save it.</span>
            {error && <span className="br_approval__error">{error}</span>}
            <div className="br_approval__actions">
              <button type="button" className="ag_btn ag_btn--ghost" disabled={busy} onClick={() => answer({ cancel: true }, "sign-in cancelled")}>Cancel</button>
              <button type="submit" className="ag_btn ag_btn--primary" disabled={busy}>{busy && <LoaderCircle size={14} className="spin" />} Sign in</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// The browser's latest screenshot while the agent works.
export const BrowserScreenshot = ({ image }: { image: string }) => (
  <figure className="br_shot">
    <figcaption><Monitor size={13} /> Agent's browser</figcaption>
    <img src={image} alt="Latest screenshot of the agent's browser" />
  </figure>
);
