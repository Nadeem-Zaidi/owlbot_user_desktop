import { useEffect, useState } from "react";
import { Brain, Check, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button, ConfirmDialog, ErrorNote } from "@/shared/ui/ui";
import { settingsApi, type Memory, type MemoryMode, type MemoryOverview } from "@/features/settings/api/settings_api";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

const MODES: { id: MemoryMode; label: string; hint: string }[] = [
  { id: "auto", label: "Automatic", hint: "The assistant saves useful facts as you chat. You can undo or edit them here." },
  { id: "review", label: "Ask me first", hint: "Saved facts wait here as suggestions until you approve them." },
  { id: "off", label: "Off", hint: "Nothing is saved or used. Your existing memories are kept until you delete them." },
];

// What the assistant remembers about the user across all chats (web,
// WhatsApp, agents). Everything here is visible and editable.
export const MemoryPage = () => {
  const [data, setData] = useState<MemoryOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    settingsApi.memory().then(setData).catch((e) => setError(errorText(e)));
  }, []);

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    setError(null);
    try { await fn(); } catch (e) { setError(errorText(e)); } finally { setBusyId(null); }
  };
  const replace = (m: Memory) => setData((d) => d && { ...d, memories: d.memories.map((x) => (x.id === m.id ? m : x)) });
  const drop = (id: string) => setData((d) => d && { ...d, memories: d.memories.filter((x) => x.id !== id) });

  const setMode = (mode: MemoryMode) => run("mode", async () => {
    await settingsApi.setMemoryMode(mode);
    setData((d) => d && { ...d, mode });
  });
  const add = () => run("add", async () => {
    const m = await settingsApi.addMemory(draft.trim());
    setData((d) => d && { ...d, memories: [m, ...d.memories.filter((x) => x.id !== m.id)] });
    setDraft("");
    setAdding(false);
  });
  const saveEdit = (id: string) => run(id, async () => {
    replace(await settingsApi.editMemory(id, { content: editText.trim() }));
    setEditId(null);
  });
  const approve = (id: string) => run(id, async () => { replace(await settingsApi.editMemory(id, { status: "active" })); });
  const remove = (id: string) => run(id, async () => { await settingsApi.deleteMemory(id); drop(id); });
  const clearAll = () => run("clear", async () => {
    await settingsApi.clearMemory();
    setData((d) => d && { ...d, memories: [] });
    setConfirmClear(false);
  });

  const pending = data?.memories.filter((m) => m.status === "proposed") ?? [];
  const saved = data?.memories.filter((m) => m.status === "active") ?? [];
  const maxChars = data?.maxChars ?? 300;

  const row = (m: Memory) => (
    <li key={m.id} className={`st_mem ${m.status === "proposed" ? "is_pending" : ""}`}>
      {editId === m.id ? (
        <div className="st_mem__edit">
          <textarea
            className="ag_input"
            value={editText}
            maxLength={maxChars}
            rows={2}
            autoFocus
            aria-label="Edit memory"
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void saveEdit(m.id); } if (e.key === "Escape") setEditId(null); }}
          />
          <div className="st_mem__actions">
            <Button variant="primary" busy={busyId === m.id} disabled={!editText.trim()} onClick={() => void saveEdit(m.id)}>Save</Button>
            <Button variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="st_mem__main">
            <p className="st_mem__text">{m.content}</p>
            <span className="ag_small ag_muted">
              {m.source === "user" ? "Added by you" : "Saved from a chat"} · {fmtDate(m.updated_at)}
            </span>
          </div>
          <div className="st_mem__actions">
            {m.status === "proposed" && (
              <button type="button" className="ag_icon_btn st_mem__approve" aria-label="Approve" title="Approve" disabled={busyId === m.id} onClick={() => void approve(m.id)}><Check size={16} /></button>
            )}
            <button type="button" className="ag_icon_btn" aria-label="Edit" title="Edit" onClick={() => { setEditId(m.id); setEditText(m.content); }}><Pencil size={15} /></button>
            <button type="button" className="ag_icon_btn ag_icon_btn--danger" aria-label={m.status === "proposed" ? "Dismiss" : "Delete"} title={m.status === "proposed" ? "Dismiss" : "Delete"} disabled={busyId === m.id} onClick={() => void remove(m.id)}>
              {m.status === "proposed" ? <X size={16} /> : <Trash2 size={15} />}
            </button>
          </div>
        </>
      )}
    </li>
  );

  return (
    <div className="ag_page st_page">
      <header className="ag_page__header">
        <div>
          <h1 className="ag_page__title">Memory</h1>
          <p className="ag_page__subtitle">
            Things the assistant remembers about you in every chat — on the web, on WhatsApp and with your agents.
            Ask it to "remember …" or "forget …", or manage them here.
          </p>
        </div>
        <Button variant="primary" onClick={() => setAdding(true)} disabled={!data}><Plus size={15} /> Add memory</Button>
      </header>

      <ErrorNote message={error} />

      {!data ? (
        <div className="st_loading"><LoaderCircle size={18} className="spin" /> Loading…</div>
      ) : (
        <>
          <section className="st_mem_modes" role="radiogroup" aria-label="Memory setting">
            {MODES.map((mo) => (
              <button
                key={mo.id}
                type="button"
                role="radio"
                aria-checked={data.mode === mo.id}
                className={`st_mem_mode ${data.mode === mo.id ? "is_on" : ""}`}
                disabled={busyId === "mode"}
                onClick={() => data.mode !== mo.id && void setMode(mo.id)}
              >
                <strong>{mo.label}</strong>
                <span className="ag_small ag_muted">{mo.hint}</span>
              </button>
            ))}
          </section>

          {adding && (
            <div className="st_mem_add">
              <textarea
                className="ag_input"
                placeholder={'e.g. "I work on IBM Maximo preventive maintenance" or "Prefers short answers"'}
                value={draft}
                maxLength={maxChars}
                rows={2}
                autoFocus
                aria-label="New memory"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && draft.trim()) { e.preventDefault(); void add(); } if (e.key === "Escape") setAdding(false); }}
              />
              <div className="st_mem__actions">
                <span className="ag_small ag_muted">{draft.length}/{maxChars}</span>
                <Button variant="primary" busy={busyId === "add"} disabled={!draft.trim()} onClick={() => void add()}>Save</Button>
                <Button variant="ghost" onClick={() => { setAdding(false); setDraft(""); }}>Cancel</Button>
              </div>
            </div>
          )}

          {pending.length > 0 && (
            <section className="st_mem_section">
              <h2 className="st_mem_heading">Suggestions <span className="ag_chip">{pending.length}</span></h2>
              <p className="ag_small ag_muted">Approve the ones you want the assistant to remember.</p>
              <ul className="st_mems">{pending.map(row)}</ul>
            </section>
          )}

          <section className="st_mem_section">
            <h2 className="st_mem_heading">Saved <span className="ag_chip">{saved.length}/{data.limit}</span></h2>
            {saved.length === 0 ? (
              <div className="st_empty">
                <Brain size={22} />
                <div>
                  <strong>Nothing saved yet</strong>
                  <p className="ag_muted">Tell the assistant something like "remember that I prefer short answers", or add a memory yourself.</p>
                </div>
              </div>
            ) : (
              <ul className="st_mems">{saved.map(row)}</ul>
            )}
          </section>

          {data.memories.length > 0 && (
            <div className="st_mem_footer">
              <Button variant="danger" onClick={() => setConfirmClear(true)}><Trash2 size={15} /> Forget everything</Button>
            </div>
          )}
        </>
      )}

      {confirmClear && (
        <ConfirmDialog
          title="Forget everything?"
          message="All saved memories and suggestions are deleted. Your chats are not affected. This can't be undone."
          confirmLabel="Forget everything"
          onConfirm={() => void clearAll()}
          onCancel={() => setConfirmClear(false)}
          busy={busyId === "clear"}
        />
      )}
    </div>
  );
};
