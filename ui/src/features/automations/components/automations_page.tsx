import { useEffect, useState } from "react";
import { BellRing, Eye, Globe2, Inbox, Smartphone } from "lucide-react";
import { ago, automationsApi, browserTimezone, type Alert, type AutomationSettings } from "@/features/automations/api/automations_api";
import { RemindersTab } from "@/features/automations/components/reminders_tab";
import { WatchersTab } from "@/features/automations/components/watchers_tab";

type Tab = "reminders" | "watchers" | "alerts";

// Reminders & alerts: reminders/to-dos, web watchers, and everything they sent.
export const AutomationsPage = () => {
  const [tab, setTab] = useState<Tab>("reminders");
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [editingTz, setEditingTz] = useState(false);
  const [tz, setTz] = useState("");

  useEffect(() => {
    (async () => {
      let s = await automationsApi.settings().catch(() => null);
      // First visit: use this browser's timezone, so "9am" means 9am here.
      const local = browserTimezone();
      if (s && !s.saved && local && local !== s.timezone) s = await automationsApi.setTimezone(local).catch(() => s);
      setSettings(s);
    })();
    automationsApi.unread().then(setUnread).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== "alerts") return;
    automationsApi.alerts().then((r) => {
      setAlerts(r.alerts);
      if (r.unread) automationsApi.markRead().then(() => { setUnread(0); window.dispatchEvent(new Event("owl:alerts-read")); }).catch(() => {});
    }).catch(() => setAlerts([]));
  }, [tab]);

  const saveTz = async () => {
    const s = await automationsApi.setTimezone(tz.trim()).catch(() => null);
    if (s) setSettings(s);
    setEditingTz(false);
  };

  return (
    <div className="ag_page">
      <header className="ag_page__header">
        <div>
          <h1 className="ag_page__title">Reminders & alerts</h1>
          <p className="ag_page__subtitle">Reminders and to-dos, and web pages watched for you. Alerts go to your linked WhatsApp or Telegram — or show up here.</p>
        </div>
      </header>

      <div className="rm_bar">
        <div className="ag_segmented" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "reminders"} className={tab === "reminders" ? "is_active" : ""} onClick={() => setTab("reminders")}><BellRing size={14} /> Reminders & to-dos</button>
          <button type="button" role="tab" aria-selected={tab === "watchers"} className={tab === "watchers" ? "is_active" : ""} onClick={() => setTab("watchers")}><Eye size={14} /> Web watchers</button>
          <button type="button" role="tab" aria-selected={tab === "alerts"} className={tab === "alerts" ? "is_active" : ""} onClick={() => setTab("alerts")}>
            <Inbox size={14} /> Alerts{unread > 0 && <span className="rm_badge">{unread}</span>}
          </button>
        </div>
        {settings && (
          <span className="rm_tz ag_small">
            <Globe2 size={13} />
            {editingTz ? (
              <>
                <input className="ag_input" value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Asia/Kolkata" aria-label="Timezone" />
                <button type="button" className="rm_link" onClick={() => void saveTz()}>Save</button>
              </>
            ) : (
              <>Times in {settings.timezone} <button type="button" className="rm_link" onClick={() => { setTz(settings.timezone); setEditingTz(true); }}>change</button></>
            )}
          </span>
        )}
      </div>

      {tab === "reminders" && <RemindersTab timezone={settings?.timezone ?? ""} />}
      {tab === "watchers" && <WatchersTab />}
      {tab === "alerts" && (
        <section className="rm_section">
          {alerts === null ? <div className="ag_card ag_card--skeleton" /> : alerts.length === 0 ? (
            <p className="ag_muted">No alerts yet. Reminders and watcher alerts appear here as they're sent.</p>
          ) : (
            <ul className="rm_list">
              {alerts.map((a) => (
                <li key={a.id} className={`rm_alert ${a.read_at ? "" : "is_unread"}`}>
                  <span className="rm_watch__icon">{a.kind === "reminder" ? <BellRing size={16} /> : <Eye size={16} />}</span>
                  <div className="rm_task__text">
                    <strong>{a.title}</strong>
                    {a.body && <span className="rm_alert__body">{a.body}</span>}
                    <span className="ag_muted ag_small">{ago(a.created_at)} · {a.delivered_via === "phone" ? <><Smartphone size={11} /> sent to your phone</> : "shown here (link WhatsApp or Telegram to get it on your phone)"}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
};
