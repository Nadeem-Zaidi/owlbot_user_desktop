import { useEffect, useMemo, useState } from "react";
import { BellRing, Check, ListTodo, Pencil, Plus, Repeat as RepeatIcon, Trash2, X } from "lucide-react";
import { Button, ErrorNote } from "@/shared/ui/ui";
import { automationsApi, prettyLocal, REPEAT_LABEL, type Repeat, type Task } from "@/features/automations/api/automations_api";

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const REPEATS: Repeat[] = ["none", "daily", "weekdays", "weekly", "monthly", "yearly"];

type Draft = { title: string; when: string; repeat: Repeat; notes: string };
const EMPTY: Draft = { title: "", when: "", repeat: "none", notes: "" };

// Reminders (with a time — sent to your phone) and to-dos (without).
export const RemindersTab = ({ timezone }: { timezone: string }) => {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (all = showDone) => automationsApi.tasks(all).then(setTasks).catch((e) => setError(errorText(e, "Couldn't load your tasks")));
  useEffect(() => { void load(showDone); }, [showDone]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const open = (tasks ?? []).filter((t) => t.status === "open");
    return {
      reminders: open.filter((t) => t.remind_at).sort((a, b) => (a.remind_at! < b.remind_at! ? -1 : 1)),
      todos: open.filter((t) => !t.remind_at),
      done: (tasks ?? []).filter((t) => t.status !== "open"),
    };
  }, [tasks]);

  const input = (d: Draft) => ({ title: d.title, notes: d.notes, remind_at: d.when || undefined, repeat: d.when ? d.repeat : "none" as Repeat });

  const add = async () => {
    setBusy("add");
    setError(null);
    try {
      await automationsApi.createTask(input(draft));
      setDraft(EMPTY);
      await load();
    } catch (e) {
      setError(errorText(e, "Couldn't add it"));
    } finally {
      setBusy(null);
    }
  };

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
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

  const saveEdit = () => editing && act(editing.id, async () => {
    await automationsApi.updateTask(editing.id, input(editing.draft));
    setEditing(null);
  });

  const row = (t: Task) => {
    if (editing?.id === t.id) {
      return (
        <li key={t.id} className="rm_task rm_task--edit">
          <DraftFields draft={editing.draft} onChange={(d) => setEditing({ id: t.id, draft: d })} />
          <div className="rm_task__actions">
            <Button variant="primary" onClick={() => void saveEdit()} busy={busy === t.id} disabled={!editing.draft.title.trim()}>Save</Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </li>
      );
    }
    const done = t.status !== "open";
    return (
      <li key={t.id} className={`rm_task ${done ? "is_done" : ""}`}>
        <button type="button" className={`rm_check ${done ? "is_on" : ""}`} aria-label={done ? `Reopen ${t.title}` : `Mark ${t.title} done`} disabled={busy === t.id}
          onClick={() => void act(t.id, () => automationsApi.setTaskStatus(t.id, done ? "open" : "done"))}>
          {done && <Check size={13} />}
        </button>
        <div className="rm_task__text">
          <strong>{t.title}</strong>
          {t.notes && <span className="ag_muted ag_small">{t.notes}</span>}
          <span className="rm_task__meta">
            {t.remind_local && <span className="rm_when"><BellRing size={12} /> {prettyLocal(t.remind_local)}</span>}
            {t.repeat !== "none" && <span className="rm_when"><RepeatIcon size={12} /> {REPEAT_LABEL[t.repeat]}</span>}
            {t.timezone !== timezone && t.remind_local && <span className="ag_muted ag_small">{t.timezone}</span>}
            {t.source === "chat" && <span className="ag_muted ag_small">· from a chat</span>}
            {t.status === "cancelled" && <span className="ag_muted ag_small">· cancelled</span>}
          </span>
        </div>
        <div className="rm_task__actions">
          {!done && (
            <button type="button" className="ag_icon_btn" aria-label={`Edit ${t.title}`}
              onClick={() => setEditing({ id: t.id, draft: { title: t.title, notes: t.notes, when: t.remind_local ?? "", repeat: t.repeat } })}>
              <Pencil size={15} />
            </button>
          )}
          <button type="button" className="ag_icon_btn" aria-label={`Delete ${t.title}`} onClick={() => void act(t.id, () => automationsApi.deleteTask(t.id))}><Trash2 size={15} /></button>
        </div>
      </li>
    );
  };

  return (
    <section className="rm_section">
      <div className="rm_add">
        <DraftFields draft={draft} onChange={setDraft} autoFocus />
        <Button variant="primary" onClick={() => void add()} busy={busy === "add"} disabled={!draft.title.trim()}><Plus size={15} /> {draft.when ? "Add reminder" : "Add to-do"}</Button>
      </div>
      <p className="ag_muted ag_small">Tip: just tell the assistant — in chat, WhatsApp or Telegram — “remind me to pay rent on the 1st of every month at 9am”.</p>
      <ErrorNote message={error} />

      {tasks === null ? <div className="ag_card ag_card--skeleton" /> : (
        <>
          <h3 className="rm_h3"><BellRing size={15} /> Reminders <span className="ag_muted">{groups.reminders.length}</span></h3>
          {groups.reminders.length ? <ul className="rm_list">{groups.reminders.map(row)}</ul> : <p className="ag_muted ag_small">No upcoming reminders.</p>}
          <h3 className="rm_h3"><ListTodo size={15} /> To-dos <span className="ag_muted">{groups.todos.length}</span></h3>
          {groups.todos.length ? <ul className="rm_list">{groups.todos.map(row)}</ul> : <p className="ag_muted ag_small">Nothing to do. 🎉</p>}
          <button type="button" className="rm_link" onClick={() => setShowDone((v) => !v)}>{showDone ? <><X size={13} /> Hide completed</> : "Show completed (last 30 days)"}</button>
          {showDone && (groups.done.length ? <ul className="rm_list">{groups.done.map(row)}</ul> : <p className="ag_muted ag_small">Nothing completed recently.</p>)}
        </>
      )}
    </section>
  );
};

const DraftFields = ({ draft, onChange, autoFocus }: { draft: Draft; onChange: (d: Draft) => void; autoFocus?: boolean }) => (
  <div className="rm_fields">
    <input className="ag_input rm_fields__title" value={draft.title} maxLength={300} placeholder="What do you need to remember?" aria-label="Title" autoFocus={autoFocus}
      onChange={(e) => onChange({ ...draft, title: e.target.value })} />
    <input className="ag_input" type="datetime-local" value={draft.when} aria-label="Remind me at (optional)" title="Remind me at (leave empty for a to-do)"
      onChange={(e) => onChange({ ...draft, when: e.target.value })} />
    <select className="ag_input" value={draft.when ? draft.repeat : "none"} disabled={!draft.when} aria-label="Repeat" onChange={(e) => onChange({ ...draft, repeat: e.target.value as Repeat })}>
      {REPEATS.map((r) => <option key={r} value={r}>{REPEAT_LABEL[r]}</option>)}
    </select>
    <input className="ag_input rm_fields__notes" value={draft.notes} maxLength={2000} placeholder="Notes (optional)" aria-label="Notes" onChange={(e) => onChange({ ...draft, notes: e.target.value })} />
  </div>
);
