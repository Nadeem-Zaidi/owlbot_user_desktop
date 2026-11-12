import { useEffect, useState } from "react";
import { Eye, Pause, Play, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { Button, ErrorNote, Field } from "@/shared/ui/ui";
import { ago, automationsApi, type Watcher } from "@/features/automations/api/automations_api";

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const EVERY: [number, string][] = [[30, "30 minutes"], [60, "hour"], [180, "3 hours"], [360, "6 hours"], [720, "12 hours"], [1440, "day"], [10080, "week"]];
const everyLabel = (m: number) => EVERY.find(([v]) => v === m)?.[1] ?? `${Math.round(m / 60)} hours`;

type Draft = { url: string; name: string; mode: "change" | "ai"; condition: string; interval: number };
const EMPTY: Draft = { url: "", name: "", mode: "ai", condition: "", interval: 360 };

// Pages checked on a schedule: alert on any change, or when a condition
// (checked by the AI) becomes true.
export const WatchersTab = () => {
  const [watchers, setWatchers] = useState<Watcher[] | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => automationsApi.watchers().then(setWatchers).catch((e) => setError(errorText(e, "Couldn't load your watchers")));
  useEffect(() => { void load(); }, []);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorText(e, "Something went wrong"));
    } finally {
      setBusy(null);
    }
  };

  const add = () => act("add", async () => {
    await automationsApi.createWatcher({ url: draft.url.trim(), name: draft.name.trim() || undefined, mode: draft.mode, condition: draft.mode === "ai" ? draft.condition : "", interval_minutes: draft.interval });
    setDraft(EMPTY);
  });

  return (
    <section className="rm_section">
      <div className="rm_card rm_watch_add">
        <div className="rm_watch_add__row">
          <Field label="Page URL"><input className="ag_input" value={draft.url} placeholder="https://…" inputMode="url" onChange={(e) => setDraft({ ...draft, url: e.target.value })} /></Field>
          <Field label="Name (optional)"><input className="ag_input" value={draft.name} maxLength={80} placeholder="e.g. Laptop price" onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
        </div>
        <div className="rm_modes" role="radiogroup" aria-label="Alert me">
          <label className={`sk_mode ${draft.mode === "ai" ? "is_on" : ""}`}><input type="radio" checked={draft.mode === "ai"} onChange={() => setDraft({ ...draft, mode: "ai" })} /> <Sparkles size={13} /> When something is true</label>
          <label className={`sk_mode ${draft.mode === "change" ? "is_on" : ""}`}><input type="radio" checked={draft.mode === "change"} onChange={() => setDraft({ ...draft, mode: "change" })} /> When anything changes</label>
        </div>
        {draft.mode === "ai" && (
          <Field label="Tell me when…" hint="The AI reads the page on each check and alerts you once when this becomes true.">
            <input className="ag_input" value={draft.condition} maxLength={500} placeholder="the price drops below ₹50,000 · tickets are available · a React job is posted"
              onChange={(e) => setDraft({ ...draft, condition: e.target.value })} />
          </Field>
        )}
        <div className="rm_watch_add__foot">
          <label className="rm_every">Check every
            <select className="ag_input" value={draft.interval} onChange={(e) => setDraft({ ...draft, interval: Number(e.target.value) })}>
              {EVERY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <Button variant="primary" onClick={() => void add()} busy={busy === "add"} disabled={!draft.url.trim() || (draft.mode === "ai" && !draft.condition.trim())}><Plus size={15} /> Start watching</Button>
        </div>
      </div>
      <p className="ag_muted ag_small">Tip: in chat or WhatsApp, say “tell me when this page shows the iPhone below ₹60,000: &lt;link&gt;”. Pages that need a login or build their content with JavaScript can't be read.</p>
      <ErrorNote message={error} />

      {watchers === null ? <div className="ag_card ag_card--skeleton" /> : watchers.length === 0 ? (
        <p className="ag_muted">You're not watching any pages yet.</p>
      ) : (
        <ul className="rm_list">
          {watchers.map((w) => (
            <li key={w.id} className={`rm_watch ${w.status === "paused" ? "is_paused" : ""}`}>
              <span className="rm_watch__icon">{w.mode === "ai" ? <Sparkles size={16} /> : <Eye size={16} />}</span>
              <div className="rm_task__text">
                <strong>{w.name} {w.status === "paused" && <span className="ag_chip">Paused</span>}</strong>
                <a className="rm_url" href={w.url} target="_blank" rel="noreferrer noopener">{w.url}</a>
                <span className="ag_small">{w.mode === "ai" ? <>Alerts when: <em>{w.condition}</em></> : "Alerts on any change"} · every {everyLabel(w.interval_minutes)}</span>
                <span className={`ag_small ${w.last_error ? "mk_bad" : "ag_muted"}`}>
                  {w.last_checked_at ? `Checked ${ago(w.last_checked_at)}: ${w.last_result ?? ""}` : "Not checked yet — the first check runs within a minute."}
                </span>
              </div>
              <div className="rm_task__actions">
                <Button variant="ghost" onClick={() => void act(w.id, () => automationsApi.checkWatcher(w.id))} busy={busy === w.id}><RefreshCw size={14} /> Check now</Button>
                <button type="button" className="ag_icon_btn" aria-label={w.status === "active" ? `Pause ${w.name}` : `Resume ${w.name}`}
                  onClick={() => void act(`s:${w.id}`, () => automationsApi.setWatcherStatus(w.id, w.status === "active" ? "paused" : "active"))}>
                  {w.status === "active" ? <Pause size={15} /> : <Play size={15} />}
                </button>
                <button type="button" className="ag_icon_btn" aria-label={`Delete ${w.name}`} onClick={() => void act(`d:${w.id}`, () => automationsApi.deleteWatcher(w.id))}><Trash2 size={15} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
