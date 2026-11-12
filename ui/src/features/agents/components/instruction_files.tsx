import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { Download, Eye, EyeOff, FilePlus2, FileText, Trash2, Upload } from "lucide-react";
import type { InstructionFile } from "@/features/agents/types";
import { Button, Toggle } from "@/shared/ui/ui";

// Keep in sync with the backend limits (service/agents/agent_service.ts).
const MAX_FILES = 10;
const MAX_FILE_CHARS = 100_000;
const MAX_TOTAL_CHARS = 200_000;
const ACCEPT = ".md,.markdown,.txt,text/markdown,text/plain";
const isMarkdownName = (name: string) => /\.(md|markdown|txt)$/i.test(name);

async function readText(file: File): Promise<string> {
  return (await file.text()).replace(/\r\n/g, "\n");
}

function filesFromDrop(e: DragEvent): File[] {
  return Array.from(e.dataTransfer.files ?? []);
}

/** "Import .md" + "Download .md" for the main instructions, with drag & drop. */
export const InstructionsImport = ({ value, onChange, agentName, children }: {
  value: string;
  onChange: (text: string) => void;
  agentName: string;
  children: ReactNode; // the instructions <textarea>
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ name: string; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (file?: File) => {
    setError(null);
    if (!file) return;
    if (!isMarkdownName(file.name)) return setError(`“${file.name}” isn't a .md or .txt file.`);
    const text = await readText(file);
    if (!text.trim()) return setError(`“${file.name}” is empty.`);
    if (text.length > 20_000) return setError(`“${file.name}” is longer than 20,000 characters — attach it below as an instruction file instead.`);
    if (!value.trim()) onChange(text);
    else setPending({ name: file.name, text });
  };

  const download = () => {
    const blob = new Blob([value], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(agentName || "agent").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent"}-instructions.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <div className="ag_instr_actions">
        <Button variant="ghost" onClick={() => inputRef.current?.click()}><Upload size={14} /> Import .md</Button>
        <Button variant="ghost" onClick={download} disabled={!value.trim()}><Download size={14} /> Download .md</Button>
        <input ref={inputRef} type="file" hidden accept={ACCEPT} onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      {pending && (
        <div className="ag_import_choice" role="status">
          <span>Loaded <strong>{pending.name}</strong> ({pending.text.length.toLocaleString()} characters). What should happen to the current instructions?</span>
          <div>
            <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
            <Button onClick={() => { onChange(`${value.trimEnd()}\n\n${pending.text}`); setPending(null); }}>Add to the end</Button>
            <Button variant="primary" onClick={() => { onChange(pending.text); setPending(null); }}>Replace</Button>
          </div>
        </div>
      )}
      {error && <div className="ag_error">{error}</div>}

      <div
        className={`ag_dropzone ${dragging ? "is_dragging" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void load(filesFromDrop(e)[0]); }}
      >
        {children}
        {dragging && <div className="ag_dropzone__overlay"><Upload size={20} /> Drop a .md file to use as instructions</div>}
      </div>
    </>
  );
};

/** Extra .md files attached to the agent (style guides, rules, glossaries…). */
export const InstructionFilesEditor = ({ files, onChange }: {
  files: InstructionFile[];
  onChange: (files: InstructionFile[]) => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = files.reduce((n, f) => n + f.content.length, 0);

  const add = async (picked: File[]) => {
    setError(null);
    let next = [...files];
    const problems: string[] = [];
    for (const file of picked) {
      if (!isMarkdownName(file.name)) { problems.push(`“${file.name}” isn't a .md or .txt file`); continue; }
      const content = await readText(file);
      if (!content.trim()) { problems.push(`“${file.name}” is empty`); continue; }
      if (content.length > MAX_FILE_CHARS) { problems.push(`“${file.name}” is over ${MAX_FILE_CHARS.toLocaleString()} characters`); continue; }
      const existing = next.findIndex((f) => f.name.toLowerCase() === file.name.toLowerCase());
      if (existing >= 0) {
        next[existing] = { ...next[existing], content }; // same name → replace its content
      } else if (next.length >= MAX_FILES) {
        problems.push(`only ${MAX_FILES} files are allowed`);
        break;
      } else {
        next.push({ name: file.name, content, enabled: true });
      }
    }
    if (next.reduce((n, f) => n + f.content.length, 0) > MAX_TOTAL_CHARS) {
      problems.push(`all files together must stay under ${MAX_TOTAL_CHARS.toLocaleString()} characters`);
      next = files;
    }
    if (problems.length) setError(`Not added: ${problems.join("; ")}.`);
    onChange(next);
  };

  return (
    <div className="ag_subsection ag_instr_files">
      <div className="ag_subsection__head">
        <div>
          <span className="ag_field__label"><FileText size={14} /> Instruction files</span>
          <span className="ag_muted ag_small">Attach .md files — style guides, rules, glossaries. Each is added to the instructions under its own heading.</span>
        </div>
        <Button variant="ghost" onClick={() => inputRef.current?.click()} disabled={files.length >= MAX_FILES}><FilePlus2 size={14} /> Attach .md</Button>
        <input ref={inputRef} type="file" hidden multiple accept={ACCEPT} onChange={(e) => { void add(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      </div>

      {files.length === 0 ? (
        <button
          type="button"
          className={`ag_placeholder ag_placeholder--drop ${dragging ? "is_dragging" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void add(filesFromDrop(e)); }}
        >
          <Upload size={18} /> <span><strong>Drop .md files here</strong> or click to choose</span>
        </button>
      ) : (
        <div
          className={`ag_list ${dragging ? "is_dragging" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void add(filesFromDrop(e)); }}
        >
          {files.map((f, i) => (
            <div key={f.name} className={`ag_item ag_item--stack ${f.enabled ? "" : "is_off"}`}>
              <div className="ag_item__row">
                <span className="ag_file_badge"><FileText size={15} /></span>
                <div className="ag_item__main">
                  <strong>{f.name}</strong>
                  <span className="ag_item__sub">{f.content.length.toLocaleString()} characters · {f.content.split("\n")[0].replace(/^#+\s*/, "").slice(0, 80)}</span>
                </div>
                <button type="button" className="ag_icon_btn" aria-label={open === f.name ? "Hide preview" : "Preview"} title={open === f.name ? "Hide preview" : "Preview"} onClick={() => setOpen(open === f.name ? null : f.name)}>
                  {open === f.name ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <Toggle label={f.enabled ? `Stop using ${f.name}` : `Use ${f.name}`} checked={f.enabled} onChange={(v) => onChange(files.map((x, j) => (j === i ? { ...x, enabled: v } : x)))} />
                <button type="button" className="ag_icon_btn ag_icon_btn--danger" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
              </div>
              {open === f.name && <pre className="ag_file_preview">{f.content}</pre>}
            </div>
          ))}
        </div>
      )}

      <div className="ag_meter" title="Instruction files are sent with every message, so keep them focused">
        <div className="ag_meter__bar"><span style={{ width: `${Math.min(100, (total / MAX_TOTAL_CHARS) * 100)}%` }} /></div>
        <span className="ag_muted ag_small">{files.length}/{MAX_FILES} files · {total.toLocaleString()} / {MAX_TOTAL_CHARS.toLocaleString()} characters · drop a file with the same name to replace it</span>
      </div>
      {error && <div className="ag_error">{error}</div>}
    </div>
  );
};

/** "Load from .md" for the describe box. */
export const LoadDescriptionButton = ({ onLoad }: { onLoad: (text: string) => void }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant="ghost" onClick={() => inputRef.current?.click()}><Upload size={14} /> Load from .md</Button>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={ACCEPT}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file && isMarkdownName(file.name)) onLoad((await readText(file)).slice(0, 4000));
        }}
      />
    </>
  );
};
