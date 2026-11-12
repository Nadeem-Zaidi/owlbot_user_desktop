import { useEffect, useRef, useState } from "react";
import { BookOpen, FileCode2, FileText, FileUp, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, ErrorNote, Field, Modal, Toggle } from "@/shared/ui/ui";
import { SKILL_TEMPLATES, skillsApi, type SkillFile, type SkillInput, type SkillSummary } from "@/features/skills/api/skills_api";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const NEW: SkillInput = { name: "", description: "", content: "", enabled: true };
// While typing: lowercase, invalid characters → "-" (a trailing dash stays,
// so "code-" can become "code-review"). Trimmed when leaving the field.
const slugTyping = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+/, "").slice(0, 64);
const slugFinal = (s: string) => slugTyping(s).replace(/-+$/, "");
const MAX_ZIP = 5 * 1024 * 1024;
const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

// File → base64 (in chunks, so large zips don't overflow the call stack).
async function toBase64(f: File): Promise<string> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// The user's skill library: reusable instructions any chat or agent can load
// when a task matches the skill's description.
export const SkillsPage = () => {
  const [skills, setSkills] = useState<SkillSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: SkillInput; files?: SkillFile[] } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SkillSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = () => skillsApi.list().then(setSkills).catch((e) => setError(errorText(e)));
  useEffect(() => { void load(); }, []);

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try { await task(); } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  };

  const openEditor = (s?: SkillSummary) => run(s ? `open:${s.id}` : "new", async () => {
    if (!s) return setEditing({ id: null, form: NEW });
    const full = await skillsApi.getSkill(s.id);
    setEditing({ id: s.id, form: { name: full.name, description: full.description, content: full.content, enabled: full.enabled }, files: full.files ?? [] });
  });

  const toggle = (s: SkillSummary, enabled: boolean) => run(`toggle:${s.id}`, async () => {
    await skillsApi.update(s.id, { enabled });
    setSkills((list) => list?.map((x) => (x.id === s.id ? { ...x, enabled } : x)) ?? null);
  });

  const importFiles = (files: FileList | null) => {
    const list = [...(files ?? [])];
    if (!list.length) return;
    setNotice(null);
    void run("import", async () => {
      const done: string[] = [];
      try {
        for (const f of list) {
          if (/\.zip$/i.test(f.name)) {
            // A skill folder: SKILL.md + its reference files and scripts.
            if (f.size > MAX_ZIP) throw new Error(`${f.name} is too big (max 5 MB)`);
            const r = await skillsApi.importZip(await toBase64(f), f.name);
            const skipped = r.skipped.length ? ` · skipped ${r.skipped.length} (${r.skipped.slice(0, 3).map((x) => `${x.path}: ${x.reason}`).join("; ")}${r.skipped.length > 3 ? "…" : ""})` : "";
            done.push(`"${r.name}" with ${r.files.length} file${r.files.length === 1 ? "" : "s"}${skipped}`);
          } else {
            if (f.size > 200_000) throw new Error(`${f.name} is too big for a skill`);
            const s = await skillsApi.importMarkdown(await f.text(), f.name);
            done.push(`"${s.name}"`);
          }
        }
      } finally {
        if (done.length) setNotice(`Imported ${done.join(", ")}.`);
        await load();
      }
    });
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <div className="ag_page st_page">
      <header className="ag_page__header">
        <div>
          <h1 className="ag_page__title">Skills</h1>
          <p className="ag_page__subtitle">
            Reusable instructions — "how we write a Maximo FDD", "our code-review checklist". Every chat and agent sees the
            list; the assistant reads a skill only when your request matches its description, so a big library costs nothing extra.
          </p>
        </div>
        <div className="sk_head_actions">
          <input ref={fileInput} type="file" accept=".md,.markdown,.txt,.zip" multiple hidden onChange={(e) => importFiles(e.target.files)} />
          <Button onClick={() => fileInput.current?.click()} busy={busy === "import"} title="A SKILL.md, or a whole skill folder as a .zip (e.g. from a skills marketplace)">
            <FileUp size={15} /> Import skill
          </Button>
          <Button variant="primary" onClick={() => void openEditor()}><Plus size={15} /> New skill</Button>
        </div>
      </header>

      <ErrorNote message={error} />
      {notice && <div className="ag_notice">{notice}</div>}
      <p className="ag_muted ag_small sk_hint">
        Import a <strong>SKILL.md</strong> or a whole <strong>skill folder as .zip</strong> (the format used by Claude skills and skill marketplaces).
        Reference files come along and the assistant can read them; bundled scripts are kept as text and never run. Review skills from others before importing — they are instructions the assistant will follow.
      </p>

      {skills === null ? (
        <div className="st_loading"><LoaderCircle size={18} className="spin" /> Loading…</div>
      ) : skills.length === 0 ? (
        <div className="sk_empty">
          <BookOpen size={22} />
          <div>
            <strong>No skills yet</strong>
            <p className="ag_muted">Write one, import a SKILL.md (the format Claude skills use), or start from a template:</p>
            <div className="sk_templates">
              {SKILL_TEMPLATES.map((t) => (
                <button key={t.name} type="button" className="ag_chip ag_chip--button" onClick={() => setEditing({ id: null, form: t })}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <ul className="sk_list">
          {skills.map((s) => (
            <li key={s.id} className={`sk_item ${s.enabled ? "" : "is_off"}`}>
              <div className="sk_item__main">
                <code className="sk_item__name">{s.name}</code>
                <span className="sk_item__desc">{s.description}</span>
                <span className="ag_muted ag_small">
                  {(s.chars / 1000).toFixed(1)}k characters
                  {!!s.file_count && <> · {s.file_count} file{s.file_count === 1 ? "" : "s"}</>}
                  {s.license && <> · {s.license}</>}
                  {" "}· updated {new Date(s.updated_at).toLocaleDateString()}
                </span>
              </div>
              <Toggle checked={s.enabled} onChange={(v) => void toggle(s, v)} label={s.enabled ? "On" : "Off"} disabled={busy === `toggle:${s.id}`} />
              <button type="button" className="ag_icon_btn" aria-label={`Edit ${s.name}`} disabled={busy === `open:${s.id}`} onClick={() => void openEditor(s)}><Pencil size={15} /></button>
              <button type="button" className="ag_icon_btn ag_icon_btn--danger" aria-label={`Delete ${s.name}`} onClick={() => setDeleting(s)}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <SkillDialog
          id={editing.id}
          initial={editing.form}
          files={editing.files}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"?`}
          message="Agents set to use this skill won't see it any more. This can't be undone."
          confirmLabel="Delete skill"
          busy={busy === "delete"}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void run("delete", async () => {
            await skillsApi.remove(deleting.id);
            setSkills((list) => list?.filter((x) => x.id !== deleting.id) ?? null);
            setDeleting(null);
          })}
        />
      )}
    </div>
  );
};

const SkillDialog = ({ id, initial, files: initialFiles, onClose, onSaved }: { id: string | null; initial: SkillInput; files?: SkillFile[]; onClose: () => void; onSaved: () => void }) => {
  const [form, setForm] = useState<SkillInput>(initial);
  const [files, setFiles] = useState<SkillFile[]>(initialFiles ?? []);
  const [viewing, setViewing] = useState<{ path: string; content: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof SkillInput>(k: K, v: SkillInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = { ...form, name: slugFinal(form.name) };
      if (id) await skillsApi.update(id, body);
      else await skillsApi.create(body);
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={id ? `Edit ${initial.name}` : "New skill"}
      subtitle="The description decides when the assistant uses it — say what kind of request it's for."
      onClose={onClose}
      wide
      footer={
        <>
          <ErrorNote message={error} />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={saving} disabled={!form.name || !form.description.trim() || !form.content.trim()} onClick={() => void save()}>
            {id ? "Save" : "Create skill"}
          </Button>
        </>
      }
    >
      <div className="sk_form">
        <Field label="Name" hint="Lowercase, numbers and dashes — e.g. maximo-fdd">
          <input className="ag_input ag_mono" value={form.name} maxLength={64} placeholder="maximo-fdd" onChange={(e) => set("name", slugTyping(e.target.value))} onBlur={() => set("name", slugFinal(form.name))} />
        </Field>
        <Field label="When to use it" hint={`${form.description.length}/300`}>
          <input className="ag_input" value={form.description} maxLength={300} placeholder="Writing an IBM Maximo functional design document" onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field label="Instructions (Markdown)" hint={`${form.content.length.toLocaleString()} / 50,000`}>
          <textarea className="ag_input ag_mono sk_content" value={form.content} maxLength={50_000} rows={16}
            placeholder={"# How we write an FDD\n\n1. Start with scope and assumptions\n2. …"} onChange={(e) => set("content", e.target.value)} />
        </Field>
        {id && files.length > 0 && (
          <div className="sk_files">
            <span className="ag_field__label">Files in this skill</span>
            <ul>
              {files.map((f) => (
                <li key={f.path}>
                  {f.kind === "script" ? <FileCode2 size={14} /> : <FileText size={14} />}
                  <button type="button" className="sk_file_link ag_mono" onClick={() => void skillsApi.getFile(id, f.path).then((x) => setViewing({ path: x.path, content: x.content })).catch((e) => setError(errorText(e)))}>
                    {f.path}
                  </button>
                  <span className="ag_muted ag_small">{f.kind === "script" ? "script · read-only, never run" : "reference"} · {kb(f.bytes)}</span>
                  <button type="button" className="ag_icon_btn ag_icon_btn--danger" aria-label={`Remove ${f.path}`}
                    onClick={() => void skillsApi.deleteFile(id, f.path).then(() => setFiles((x) => x.filter((y) => y.path !== f.path))).catch((e) => setError(errorText(e)))}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <span className="ag_field__hint">The assistant opens these with read_skill_file when the instructions mention them.</span>
          </div>
        )}
        <Toggle checked={form.enabled} onChange={(v) => set("enabled", v)} label={form.enabled ? "On — available to chats and agents" : "Off"} />
      </div>
      {viewing && (
        <Modal title={viewing.path} onClose={() => setViewing(null)} wide footer={<Button variant="primary" onClick={() => setViewing(null)}>Close</Button>}>
          <pre className="sk_file_view">{viewing.content}</pre>
        </Modal>
      )}
    </Modal>
  );
};
