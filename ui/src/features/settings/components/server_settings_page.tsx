import { useEffect, useState } from "react";
import { LoaderCircle, Plus, Smartphone, X } from "lucide-react";
import { Button, ErrorNote, Field, Toggle } from "@/shared/ui/ui";
import { settingsApi, type WhatsAppSettingsView } from "@/features/settings/api/settings_api";
import { TelegramSettingsSection } from "@/features/settings/components/telegram_settings";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const STATE_LABEL: Record<string, string> = {
  connected: "Connected",
  awaiting_qr: "Waiting to be paired — open Connect WhatsApp to scan the QR",
  starting: "Starting…",
  disconnected: "Not connected",
  logged_out: "Logged out — pair again from Connect WhatsApp",
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Server-wide settings for the app owner (OWNER_EMAILS). Saved in the
// database and applied without a restart.
export const ServerSettingsPage = () => {
  const [view, setView] = useState<WhatsAppSettingsView | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);

  const load = () =>
    settingsApi.whatsappSettings()
      .then(setView)
      .catch((e) => (/owner/i.test(errorText(e)) ? setForbidden(true) : setError(errorText(e))));
  useEffect(() => { void load(); }, []);
  // While WhatsApp is starting or waiting for a QR, keep the status fresh.
  useEffect(() => {
    if (!view || !view.settings.enabled || view.runtime.state === "connected") return;
    const t = setInterval(() => void settingsApi.whatsappSettings().then(setView).catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [view]);

  const save = async (patch: Partial<WhatsAppSettingsView["settings"]>) => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      setView(await settingsApi.saveWhatsappSettings(patch));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const addAdmin = () => {
    const value = email.trim().toLowerCase();
    if (!view || !EMAIL.test(value)) return setError("Enter a valid email address.");
    if (view.settings.adminEmails.includes(value)) return setEmail("");
    setEmail("");
    void save({ adminEmails: [...view.settings.adminEmails, value] });
  };

  if (forbidden) {
    return (
      <div className="ag_page st_page">
        <h1 className="ag_page__title">Server settings</h1>
        <div className="ag_error">Only the app owner can change server settings. Owners are listed in OWNER_EMAILS on the server.</div>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="ag_page st_page">
        <h1 className="ag_page__title">Server settings</h1>
        {error ? <ErrorNote message={error} /> : <div className="st_loading"><LoaderCircle size={18} className="spin" /> Loading…</div>}
      </div>
    );
  }

  const s = view.settings;
  const rt = view.runtime;
  return (
    <div className="ag_page st_page">
      <header className="ag_page__header">
        <div>
          <h1 className="ag_page__title">Server settings</h1>
          <p className="ag_page__subtitle">Applies to everyone on this server. Changes take effect right away — no restart.</p>
        </div>
        {saved && <span className="st_saved">Saved</span>}
      </header>

      <ErrorNote message={error} />

      <section className="ag_section st_section">
        <div className="st_section__head">
          <Smartphone size={18} />
          <div>
            <h2>WhatsApp</h2>
            <p className="ag_muted ag_small">Chat with Owl from WhatsApp. People link their number from Connect WhatsApp in the sidebar.</p>
          </div>
        </div>

        <div className="st_setting">
          <div>
            <strong>Run the WhatsApp bot</strong>
            <p className="ag_muted ag_small">
              {s.enabled
                ? rt.hostedHere
                  ? <>Status: {STATE_LABEL[rt.state] ?? rt.state}{rt.botNumber ? ` (+${rt.botNumber})` : ""}</>
                  : "Runs on the jobs server — changes reach it within about 15 seconds."
                : "Off — the bot doesn't connect to WhatsApp."}
            </p>
          </div>
          <Toggle checked={s.enabled} onChange={(v) => void save({ enabled: v })} label={s.enabled ? "On" : "Off"} disabled={saving} />
        </div>

        <div className="st_setting">
          <div>
            <strong>Runs on my own number (self-chat mode)</strong>
            <p className="ag_muted ag_small">
              Talk to the bot in WhatsApp's "Message yourself" chat. It never replies in anyone else's chat,
              and the away message becomes available. Turn off when the bot has its own number.
            </p>
          </div>
          <Toggle checked={s.selfChat} onChange={(v) => void save({ selfChat: v })} label={s.selfChat ? "On" : "Off"} disabled={saving} />
        </div>

        <div className="st_setting st_setting--stack">
          <div>
            <strong>Who may pair the bot's number</strong>
            <p className="ag_muted ag_small">
              Scanning the pairing QR turns that WhatsApp account into the bot. Owners always may; add other admins here.
              With no admins and no owners configured, any signed-in user can.
            </p>
          </div>
          <div className="st_emails">
            {s.adminEmails.map((e) => (
              <span key={e} className="st_email">
                {e}
                <button type="button" aria-label={`Remove ${e}`} onClick={() => void save({ adminEmails: s.adminEmails.filter((x) => x !== e) })} disabled={saving}><X size={12} /></button>
              </span>
            ))}
            {s.adminEmails.length === 0 && <span className="ag_muted ag_small">No extra admins — only owners.</span>}
          </div>
          <Field label="Add an admin">
            <div className="st_manual">
              <input id="st_admin_email" className="ag_input" type="email" placeholder="name@example.com" value={email}
                onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAdmin(); } }} />
              <Button onClick={addAdmin} disabled={!email.trim() || saving}><Plus size={14} /> Add</Button>
            </div>
          </Field>
        </div>

        {view.updatedAt && (
          <p className="ag_muted ag_small st_meta">
            Last changed {new Date(view.updatedAt).toLocaleString()}{view.updatedBy && view.updatedBy !== "env" ? ` by ${view.updatedBy}` : view.updatedBy === "env" ? " (copied from the server's .env)" : ""}
          </p>
        )}
      </section>

      <TelegramSettingsSection />
    </div>
  );
};
