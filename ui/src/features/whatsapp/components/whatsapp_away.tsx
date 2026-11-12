import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Moon } from "lucide-react";
import { api, type WhatsAppAway } from "@/features/chat/api/chat_api";

const DEFAULT_MESSAGE =
  "Hi {name} 👋 I'm Owl, Nadeem's assistant. Nadeem isn't available right now and will get back to you as soon as possible.";

const REPEAT_OPTIONS = [
  { minutes: 60, label: "Once an hour" },
  { minutes: 240, label: "Once every 4 hours" },
  { minutes: 720, label: "Once every 12 hours" },
  { minutes: 1440, label: "Once a day" },
];

// "2026-10-05T18:30" for <input type="datetime-local"> in the browser's timezone.
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const relative = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
};

// Automatic reply sent to people who message your number while you're away
// (bot running on your own number: self-chat mode in Server settings).
export const WhatsAppAwayPanel = () => {
  const [saved, setSaved] = useState<WhatsAppAway | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [cooldown, setCooldown] = useState(720);
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    api.getWhatsAppAway()
      .then((a) => {
        setSaved(a);
        setEnabled(a.enabled);
        if (a.message) setMessage(a.message);
        setCooldown(a.cooldown_minutes);
        setUntil(toLocalInput(a.until));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the away message"));
  }, []);

  const preview = useMemo(() => message.replace(/\{name\}/gi, "Rahul").trim(), [message]);
  const dirty = !!saved && (enabled !== saved.enabled || message.trim() !== saved.message || cooldown !== saved.cooldown_minutes || until !== toLocalInput(saved.until));

  const save = async (nextEnabled = enabled) => {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const a = await api.saveWhatsAppAway({
        enabled: nextEnabled,
        message: message.trim(),
        cooldown_minutes: cooldown,
        until: until ? new Date(until).toISOString() : null,
      });
      setSaved({ ...(saved as WhatsAppAway), ...a });
      setEnabled(a.enabled);
      setFlash(a.enabled ? "Away message is on." : "Away message is off.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  if (!saved && !error) {
    return <div className="wa_away wa_away--loading"><LoaderCircle size={16} className="spin" /> Loading away message…</div>;
  }
  if (!saved) return <div className="wa_away"><p className="wa_away__error">{error}</p></div>;

  return (
    <section className={`wa_away ${saved.enabled ? "is_on" : ""}`} aria-label="Away message">
      <div className="wa_away__head">
        <span className="wa_away__icon"><Moon size={16} /></span>
        <div className="wa_away__title">
          <strong>Away message</strong>
          <span>
            {saved.enabled
              ? `On${saved.until ? ` until ${new Date(saved.until).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}` : ""} · replied to ${saved.recipients?.total ?? 0} ${(saved.recipients?.total ?? 0) === 1 ? "person" : "people"}`
              : "Off — people who message you get no automatic reply"}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Away message"
          className={`wa_away__switch ${enabled ? "is_on" : ""}`}
          disabled={busy}
          onClick={() => void save(!enabled)}
        >
          <span />
        </button>
      </div>

      <label className="wa_away__field">
        <span>Message <em>({"{name}"} becomes their WhatsApp name)</em></span>
        <textarea rows={4} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>

      <div className="wa_away__row">
        <label className="wa_away__field">
          <span>Send to each person</span>
          <select value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))}>
            {REPEAT_OPTIONS.map((o) => <option key={o.minutes} value={o.minutes}>{o.label}</option>)}
            {!REPEAT_OPTIONS.some((o) => o.minutes === cooldown) && <option value={cooldown}>Every {cooldown} minutes</option>}
          </select>
        </label>
        <label className="wa_away__field">
          <span>Turn off automatically</span>
          <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
      </div>

      <div className="wa_away__preview" aria-label="Preview">
        <span className="wa_away__preview_label">Preview</span>
        <div className="wa_away__bubble">{preview || "…"}</div>
      </div>

      <p className="wa_away__note">
        Sent only to people who message you directly — never to groups, and not in chats where you replied yourself in the last 30 minutes.
      </p>

      {error && <p className="wa_away__error">{error}</p>}
      {flash && !error && <p className="wa_away__ok">{flash}</p>}

      <div className="wa_away__actions">
        {until && <button type="button" className="wa_modal__secondary" onClick={() => setUntil("")}>Clear end time</button>}
        <button type="button" className="wa_away__save" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? <LoaderCircle size={15} className="spin" /> : null} Save changes
        </button>
      </div>

      {saved.recipients && saved.recipients.recent.length > 0 && (
        <details className="wa_away__recent">
          <summary>Recently replied to</summary>
          <ul>
            {saved.recipients.recent.map((r, i) => (
              <li key={i}>
                <span>{r.name || (r.number ? `+${r.number}` : "Someone")}</span>
                <span>{relative(r.repliedAt)}{r.count > 1 ? ` · ${r.count}×` : ""}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
};
