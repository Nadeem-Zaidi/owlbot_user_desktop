import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTelegram } from "@fortawesome/free-brands-svg-icons";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { Button, ErrorNote, Field, Toggle } from "@/shared/ui/ui";
import { settingsApi, type TelegramSettingsView } from "@/features/settings/api/settings_api";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const STATE_LABEL: Record<string, string> = {
  connected: "Connected",
  starting: "Starting…",
  disconnected: "Not connected — retrying",
  unauthorized: "Telegram rejected the token — paste a new one",
};

// Server settings → Telegram: the bot's token (from @BotFather) and on/off.
export const TelegramSettingsSection = () => {
  const [view, setView] = useState<TelegramSettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [editingToken, setEditingToken] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsApi.telegramSettings().then(setView).catch((e) => setError(errorText(e)));
  }, []);
  // While it's starting, keep the status fresh.
  useEffect(() => {
    if (!view?.settings.enabled || view.runtime.state === "connected" || !view.runtime.hostedHere) return;
    const t = setInterval(() => void settingsApi.telegramSettings().then(setView).catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [view]);

  const save = async (body: { enabled?: boolean; botToken?: string | null }) => {
    setSaving(true);
    setError(null);
    try {
      setView(await settingsApi.saveTelegramSettings(body));
      setToken("");
      setEditingToken(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const s = view?.settings;
  const rt = view?.runtime;
  const showTokenInput = !!view && (!s?.hasToken || editingToken);

  return (
    <section className="ag_section st_section">
      <div className="st_section__head">
        <FontAwesomeIcon icon={faTelegram} className="st_section__brand st_section__brand--telegram" />
        <div>
          <h2>Telegram</h2>
          <p className="ag_muted ag_small">Chat with Owl from Telegram. People link their account from Connect Telegram in the sidebar.</p>
        </div>
      </div>

      <ErrorNote message={error} />

      {!view ? (
        !error && <div className="st_loading"><LoaderCircle size={18} className="spin" /> Loading…</div>
      ) : (
        <>
          <div className="st_setting st_setting--stack">
            <div>
              <strong>Bot token</strong>
              <p className="ag_muted ag_small">
                In Telegram, open <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">@BotFather <ExternalLink size={11} /></a>,
                send <code>/newbot</code>, and paste the token it gives you. It's checked with Telegram and stored encrypted.
              </p>
            </div>
            {showTokenInput ? (
              <Field label="Token">
                <div className="st_manual">
                  <input
                    className="ag_input"
                    type="password"
                    autoComplete="off"
                    placeholder="123456789:AA…"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && token.trim()) { e.preventDefault(); void save({ botToken: token.trim() }); } }}
                  />
                  <Button variant="primary" busy={saving} disabled={!token.trim()} onClick={() => void save({ botToken: token.trim() })}>Save</Button>
                  {s?.hasToken && <Button variant="ghost" onClick={() => { setEditingToken(false); setToken(""); }}>Cancel</Button>}
                </div>
              </Field>
            ) : (
              <div className="st_tg_token">
                <span>
                  {s?.botUsername ? <a href={`https://t.me/${s.botUsername}`} target="_blank" rel="noopener noreferrer">@{s.botUsername}</a> : "Bot"}
                  {" · "}token <code>{s?.tokenHint}</code>
                </span>
                <Button variant="ghost" onClick={() => setEditingToken(true)}>Replace</Button>
                <Button variant="ghost" disabled={saving} onClick={() => void save({ enabled: false, botToken: null })}>Remove</Button>
              </div>
            )}
          </div>

          <div className="st_setting">
            <div>
              <strong>Run the Telegram bot</strong>
              <p className="ag_muted ag_small">
                {!s?.hasToken
                  ? "Add the bot token first."
                  : s.enabled
                    ? rt?.hostedHere
                      ? <>Status: {STATE_LABEL[rt.state] ?? rt.state}</>
                      : "Runs on the jobs server — changes reach it within about 15 seconds."
                    : "Off — the bot doesn't answer."}
              </p>
            </div>
            <Toggle checked={!!s?.enabled} onChange={(v) => void save({ enabled: v })} label={s?.enabled ? "On" : "Off"} disabled={saving || !s?.hasToken} />
          </div>
        </>
      )}
    </section>
  );
};
