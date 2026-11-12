import { useRef, useState } from "react";
import { AlertTriangle, FileJson, KeyRound, Plug, Upload, Workflow } from "lucide-react";
import { Button, ErrorNote, Modal } from "@/shared/ui/ui";
import { portableApi, type AgentChoice, type ImportPreview, type ImportResult } from "@/features/portable/api/portable_api";

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

// Import an Owl export file: pick the file → see what it will create
// (and enter the tokens it needs) → import. Nothing is saved before the
// last step, and a failed import saves nothing.
export const ImportDialog = ({ onClose, onDone }: { onClose: () => void; onDone: (result: ImportResult) => void }) => {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<unknown>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<Record<string, AgentChoice>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setPreview(null);
    if (f.size > 2_000_000) return setError("The file is too large (max 2 MB).");
    setBusy(true);
    try {
      const text = await f.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("That isn't a valid JSON file.");
      }
      const p = await portableApi.preview(parsed);
      setFile(parsed);
      setFileName(f.name);
      setPreview(p);
      // Default: reuse an agent with the same name, otherwise create it.
      setChoices(Object.fromEntries(p.agents.map((a) => [a.ref, a.existing ? { mode: "existing", existing_id: a.existing.id } : { mode: "create" }])));
    } catch (e) {
      setError(errorText(e, "Couldn't read the file"));
    } finally {
      setBusy(false);
    }
  };

  const setChoice = (ref: string, patch: Partial<AgentChoice>) => setChoices((c) => ({ ...c, [ref]: { ...c[ref], ...patch } }));

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(await portableApi.import(file, { agents: choices }));
    } catch (e) {
      setError(errorText(e, "The import failed — nothing was saved"));
      setBusy(false);
    }
  };

  // Tokens still needed for agents being created (unless the server is skipped).
  const missing = preview ? preview.agents.flatMap((a) => {
    const c = choices[a.ref];
    if (c?.mode !== "create") return [];
    return a.mcp_servers.filter((s) => s.needs_token && !c.skip_mcp?.includes(s.name) && !c.mcp_tokens?.[s.name]?.trim()).map((s) => `${a.name} → ${s.name}`);
  }) : [];

  return (
    <Modal
      wide
      title="Import from a file"
      subtitle="Agents and Agent Studio projects exported from Owl (.owlbot.json). Files never contain passwords or tokens — you add them here."
      onClose={onClose}
      footer={
        <>
          <ErrorNote message={error} />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {preview && (
            <Button variant="primary" onClick={() => void run()} busy={busy} disabled={missing.length > 0} title={missing.length ? `Enter the token for ${missing[0]} (or skip that server)` : undefined}>
              <Upload size={15} /> Import
            </Button>
          )}
        </>
      }
    >
      <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      {!preview ? (
        <button type="button" className="pt_drop" onClick={() => input.current?.click()} disabled={busy}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void pick(e.dataTransfer.files?.[0]); }}>
          <FileJson size={26} />
          <strong>{busy ? "Reading…" : "Choose an export file"}</strong>
          <span className="ag_muted ag_small">or drop it here</span>
        </button>
      ) : (
        <div className="pt_plan">
          <div className="pt_file ag_small"><FileJson size={14} /> {fileName}{preview.exported_at && <span className="ag_muted"> · exported {new Date(preview.exported_at).toLocaleDateString()}</span>}
            <button type="button" className="pt_link" onClick={() => input.current?.click()}>Choose another</button>
          </div>

          {preview.agents.length > 0 && <h3 className="pt_h3">Agents ({preview.agents.length})</h3>}
          {preview.agents.map((a) => {
            const c = choices[a.ref] ?? { mode: "create" };
            const creating = c.mode === "create";
            return (
              <div key={a.ref} className="pt_agent">
                <div className="pt_agent__head">
                  <span className="pt_agent__icon">{a.icon}</span>
                  <div className="pt_agent__text">
                    <strong>{a.name}</strong>
                    <span className="ag_muted ag_small">
                      {[a.tools && `${a.tools} tool${a.tools === 1 ? "" : "s"}`, a.functions && `${a.functions} function${a.functions === 1 ? "" : "s"}`, a.mcp_servers.length && `${a.mcp_servers.length} MCP server${a.mcp_servers.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ") || a.description}
                    </span>
                  </div>
                  {a.existing ? (
                    <select className="ag_input pt_mode" value={c.mode} aria-label={`What to do with ${a.name}`}
                      onChange={(e) => setChoice(a.ref, e.target.value === "existing" ? { mode: "existing", existing_id: a.existing!.id } : { mode: "create" })}>
                      <option value="existing">Use my existing “{a.existing.name}”</option>
                      <option value="create">Create a new copy</option>
                    </select>
                  ) : <span className="ag_chip">New agent</span>}
                </div>

                {creating && (
                  <>
                    {a.mcp_servers.map((s) => {
                      const skipped = !!c.skip_mcp?.includes(s.name);
                      return (
                        <div key={s.name} className="pt_need">
                          <span className="pt_need__label"><Plug size={13} /> MCP server <strong>{s.name}</strong> <span className="ag_muted">({s.tools} tools)</span></span>
                          {s.needs_token && !skipped && (
                            <input className="ag_input ag_mono" type="password" autoComplete="new-password" aria-label={`Access token for ${s.name}`}
                              placeholder={s.url.includes("atlassian.com") ? "you@company.com:ATATT…" : "Access token"}
                              value={c.mcp_tokens?.[s.name] ?? ""} onChange={(e) => setChoice(a.ref, { mcp_tokens: { ...c.mcp_tokens, [s.name]: e.target.value } })} />
                          )}
                          <label className="pt_skip ag_small">
                            <input type="checkbox" checked={skipped} onChange={(e) => setChoice(a.ref, { skip_mcp: e.target.checked ? [...(c.skip_mcp ?? []), s.name] : (c.skip_mcp ?? []).filter((x) => x !== s.name) })} />
                            Skip — add it later
                          </label>
                        </div>
                      );
                    })}
                    {a.secret_headers.map((h) => (
                      <div key={h.key} className="pt_need">
                        <span className="pt_need__label"><KeyRound size={13} /> Function <strong>{h.function}</strong> · secret header {h.header}</span>
                        <input className="ag_input ag_mono" type="password" autoComplete="new-password" aria-label={`${h.header} for ${h.function}`} placeholder="Value (optional — the function stays off without it)"
                          value={c.secrets?.[h.key] ?? ""} onChange={(e) => setChoice(a.ref, { secrets: { ...c.secrets, [h.key]: e.target.value } })} />
                      </div>
                    ))}
                    {a.skills_to_create.length > 0 && <p className="ag_muted ag_small">Also creates skill{a.skills_to_create.length === 1 ? "" : "s"}: {a.skills_to_create.join(", ")}</p>}
                    {a.warnings.map((w) => <p key={w} className="pt_warn ag_small"><AlertTriangle size={12} /> {w}</p>)}
                  </>
                )}
                {!creating && <p className="ag_muted ag_small">Your agent is used as it is — no tokens needed, nothing about it changes.</p>}
              </div>
            );
          })}

          {preview.projects.length > 0 && <h3 className="pt_h3">Agent Studio projects ({preview.projects.length})</h3>}
          {preview.projects.map((p) => (
            <div key={p.name} className="pt_project">
              <Workflow size={15} />
              <div className="pt_agent__text">
                <strong>{p.final_name}</strong>
                {p.final_name !== p.name && <span className="ag_muted ag_small">Renamed — you already have “{p.name}”.</span>}
                {p.trigger_note && <span className="ag_muted ag_small">{p.trigger_note}</span>}
              </div>
            </div>
          ))}
          {missing.length > 0 && <p className="pt_warn ag_small"><AlertTriangle size={12} /> Enter the access token for {missing.join(", ")} — or tick “Skip”.</p>}
          <p className="ag_muted ag_small">Everything is checked first (including a test connection to each MCP server). If anything fails, nothing is saved.</p>
        </div>
      )}
    </Modal>
  );
};
