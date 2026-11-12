import { useMemo, useState } from "react";
import { agentsApi } from "@/features/agents/api/agents_api";
import type { AgentCatalog, Frequency, Schedule, ScheduleDraft } from "@/features/agents/types";
import { Button, ErrorNote, Field, Modal, Toggle } from "@/shared/ui/ui";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const FREQUENCIES: { id: Frequency; label: string }[] = [
  { id: "daily", label: "Every day" },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekly", label: "Weekly" },
  { id: "hourly", label: "Every few hours" },
];

const browserTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const allTimezones = (): string[] => {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
};

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@]+\.[^\s@]+$/;
// "a@x.com, b@y.com; c@z.com" → ["a@x.com", "b@y.com", "c@z.com"]
const splitEmails = (v: string) => v.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);

export const ScheduleDialog = ({ agentId, agentName, initial, whatsappLinked, email, onSaved, onClose }: {
  agentId: string;
  agentName: string;
  initial?: Schedule;
  whatsappLinked: boolean;
  email?: AgentCatalog["email"];
  onSaved: (s: Schedule) => void;
  onClose: () => void;
}) => {
  const [s, setS] = useState<ScheduleDraft>(
    initial
      ? { name: initial.name, prompt: initial.prompt, frequency: initial.frequency, interval_hours: initial.interval_hours ?? 6, time_of_day: initial.time_of_day ?? "09:00", weekday: initial.weekday ?? 1, timezone: initial.timezone, deliver_whatsapp: initial.deliver_whatsapp, deliver_email: initial.deliver_email ?? false, email_to: initial.email_to ?? [], enabled: initial.enabled }
      : { name: "", prompt: "", frequency: "daily", interval_hours: 6, time_of_day: "09:00", weekday: 1, timezone: browserTz(), deliver_whatsapp: whatsappLinked, deliver_email: false, email_to: [], enabled: true }
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Free-text recipients box; parsed on change.
  const [emailText, setEmailText] = useState((initial?.email_to ?? []).join(", "));
  const emailOn = !!email?.enabled;
  const maxRecipients = email?.maxRecipients ?? 5;
  const recipients = splitEmails(emailText);
  const badEmail = recipients.find((e) => !EMAIL_RE.test(e));
  const emailProblem = !s.deliver_email ? null
    : !recipients.length ? "Add at least one email address."
      : badEmail ? `“${badEmail}” doesn't look like an email address.`
        : recipients.length > maxRecipients ? `Up to ${maxRecipients} addresses.` : null;
  const timezones = useMemo(() => {
    const list = allTimezones();
    return list.includes(s.timezone) ? list : [s.timezone, ...list];
  }, [s.timezone]);

  const set = <K extends keyof ScheduleDraft>(key: K, value: ScheduleDraft[K]) => setS((x) => ({ ...x, [key]: value }));

  const preview =
    s.frequency === "hourly" ? `Runs every ${s.interval_hours} hour${s.interval_hours === 1 ? "" : "s"}`
      : s.frequency === "weekly" ? `Runs every ${WEEKDAYS[s.weekday ?? 1]} at ${s.time_of_day}`
        : s.frequency === "weekdays" ? `Runs Monday–Friday at ${s.time_of_day}`
          : `Runs every day at ${s.time_of_day}`;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const draft: ScheduleDraft = { ...s, email_to: recipients };
      onSaved(initial ? await agentsApi.updateSchedule(agentId, initial.id, draft) : await agentsApi.createSchedule(agentId, draft));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the schedule");
      setSaving(false);
    }
  };

  return (
    <Modal
      title={initial ? "Edit schedule" : `Schedule ${agentName}`}
      subtitle="The agent runs this task automatically and saves the result as a chat."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} busy={saving} disabled={!s.name.trim() || !s.prompt.trim() || !!emailProblem}>{initial ? "Save" : "Create schedule"}</Button>
        </>
      }
    >
      <Field label="Name">
        <input className="ag_input" value={s.name} onChange={(e) => set("name", e.target.value)} placeholder="Morning briefing" autoFocus />
      </Field>
      <Field label="What should it do?" hint="Written as a message to the agent.">
        <textarea className="ag_input" rows={3} value={s.prompt} onChange={(e) => set("prompt", e.target.value)} placeholder="Summarise what's new in my knowledge base and list three things I should review today." />
      </Field>

      <Field label="How often">
        <div className="ag_segmented" role="radiogroup">
          {FREQUENCIES.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={s.frequency === f.id} className={s.frequency === f.id ? "is_active" : ""} onClick={() => set("frequency", f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </Field>

      {s.frequency === "hourly" ? (
        <Field label="Every">
          <div className="ag_inline">
            <input className="ag_input ag_input--narrow" type="number" min={1} max={168} value={s.interval_hours ?? 6} onChange={(e) => set("interval_hours", Number(e.target.value))} />
            <span className="ag_muted">hours</span>
          </div>
        </Field>
      ) : (
        <div className="ag_row ag_row--3">
          {s.frequency === "weekly" && (
            <Field label="Day">
              <select className="ag_input" value={s.weekday ?? 1} onChange={(e) => set("weekday", Number(e.target.value))}>
                {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </Field>
          )}
          <Field label="Time">
            <input className="ag_input" type="time" value={s.time_of_day ?? "09:00"} onChange={(e) => set("time_of_day", e.target.value)} />
          </Field>
          <Field label="Timezone">
            <select className="ag_input" value={s.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {timezones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </Field>
        </div>
      )}
      <p className="ag_preview_line">{preview}{s.frequency !== "hourly" && ` (${s.timezone})`}</p>

      <div className="ag_toggle_line">
        <div>
          <strong>Send the result to WhatsApp</strong>
          <span className="ag_muted ag_small">{whatsappLinked ? "Delivered to your linked number." : "Link WhatsApp from the sidebar first."}</span>
        </div>
        <Toggle label="Send to WhatsApp" checked={s.deliver_whatsapp} onChange={(v) => set("deliver_whatsapp", v)} disabled={!whatsappLinked && !s.deliver_whatsapp} />
      </div>

      <div className="ag_toggle_line">
        <div>
          <strong>Email the result</strong>
          <span className="ag_muted ag_small">{emailOn ? `To up to ${maxRecipients} people, every time it runs.` : "Email isn't set up on this server yet."}</span>
        </div>
        <Toggle
          label="Send by email"
          checked={s.deliver_email}
          disabled={!emailOn && !s.deliver_email}
          onChange={(v) => {
            set("deliver_email", v);
            // First time on: start with the signed-in account's address.
            if (v && !emailText.trim() && email?.accountEmail) setEmailText(email.accountEmail);
          }}
        />
      </div>
      {s.deliver_email && (
        <Field label="Send to" hint={emailProblem ?? "Separate addresses with commas."}>
          <input
            className="ag_input"
            type="text"
            inputMode="email"
            autoComplete="off"
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            placeholder="me@example.com, team@example.com"
            aria-invalid={!!emailProblem}
          />
        </Field>
      )}

      <ErrorNote message={error} />
    </Modal>
  );
};
