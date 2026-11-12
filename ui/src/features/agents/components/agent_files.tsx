import { useEffect, useRef, useState, type DragEvent } from "react";
import { FileSpreadsheet, FileText, FileType2, Trash2, Upload } from "lucide-react";
import { agentsApi } from "@/features/agents/api/agents_api";
import type { AgentFile } from "@/features/agents/types";
import { Button } from "@/shared/ui/ui";

// Agent editor → files the agent can read and search. The app extracts the
// text on this computer; the original file isn't kept.

const ACCEPT = ".pdf,.docx,.xlsx,.xlsm,.csv,.tsv,.txt,.md,.markdown,.json,.jsonl,.xml,.html,.htm,.yaml,.yml,.log,.sql,.ini,.toml,.py,.js,.ts,.tsx,.jsx,.java,.cs,.go,.rs,.rb,.php,.c,.cpp,.h,.sh,.ps1,.css";
const MAX_BYTES = 25 * 1024 * 1024;
const KIND_LABEL: Record<AgentFile["kind"], string> = { pdf: "PDF", word: "Word", excel: "Excel", csv: "CSV", text: "Text" };

const size = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const icon = (kind: AgentFile["kind"]) =>
  kind === "excel" || kind === "csv" ? <FileSpreadsheet size={16} /> : kind === "pdf" || kind === "word" ? <FileType2 size={16} /> : <FileText size={16} />;

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(new Error(`Couldn't read "${file.name}"`));
    reader.readAsDataURL(file);
  });
}

const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export const AgentFilesSection = ({ agentId }: { agentId?: string }) => {
  const [files, setFiles] = useState<AgentFile[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!agentId) return;
    agentsApi.listFiles(agentId).then(setFiles).catch((e) => setErrors([message(e, "Couldn't load the files")]));
  }, [agentId]);

  const upload = async (list: File[]) => {
    if (!agentId || !list.length) return;
    const problems: string[] = [];
    for (const f of list) {
      if (f.size > MAX_BYTES) { problems.push(`"${f.name}" is larger than 25 MB.`); continue; }
      setBusy(f.name);
      try {
        const saved = await agentsApi.uploadFile(agentId, f.name, await toBase64(f));
        setFiles((cur) => [...(cur ?? []).filter((x) => x.name !== saved.name), saved].sort((a, b) => a.name.localeCompare(b.name)));
      } catch (e) {
        problems.push(message(e, `Couldn't add "${f.name}"`));
      }
    }
    setBusy(null);
    setErrors(problems);
  };

  const remove = async (f: AgentFile) => {
    if (!agentId) return;
    setBusy(f.id);
    try {
      await agentsApi.deleteFile(agentId, f.id);
      setFiles((cur) => (cur ?? []).filter((x) => x.id !== f.id));
    } catch (e) {
      setErrors([message(e, "Couldn't delete the file")]);
    } finally {
      setBusy(null);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void upload(Array.from(e.dataTransfer.files ?? []));
  };

  return (
    <section className="ag_section">
      <div className="ag_section__head">
        <div>
          <h2 className="ag_section__title">Files</h2>
          <p className="ag_muted ag_small">
            Give the agent files to work from: PDF, Word, Excel, CSV, text or code. It can search them and read them in full.
            The text is read on this computer; only the passages the agent uses go to Claude.
          </p>
        </div>
        {agentId && (
          <Button variant="primary" onClick={() => input.current?.click()} busy={!!busy && !files?.some((f) => f.id === busy)}>
            <Upload size={15} /> Add files
          </Button>
        )}
        <input ref={input} type="file" hidden multiple accept={ACCEPT} onChange={(e) => { void upload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      </div>

      {!agentId ? (
        <p className="ag_muted ag_small">Save the agent first, then add files.</p>
      ) : (
        <div
          className={`ag_dropzone ${dragging ? "is_dragging" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {files && files.length > 0 ? (
            <div className="ag_list">
              {files.map((f) => (
                <div key={f.id} className="ag_item">
                  <span className="ag_method_badge">{icon(f.kind)}</span>
                  <div className="ag_item__main">
                    <strong>{f.name}</strong>
                    <span className="ag_item__sub">
                      {KIND_LABEL[f.kind]} · {size(f.bytes)} · {f.chars.toLocaleString()} characters{f.truncated ? " · only the start was kept (very large)" : ""}
                    </span>
                  </div>
                  <button type="button" className="ag_icon_btn ag_icon_btn--danger" aria-label={`Delete ${f.name}`} disabled={busy === f.id} onClick={() => void remove(f)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : files ? (
            <button type="button" className="ag_placeholder" onClick={() => input.current?.click()}>
              <Upload size={18} /> <span><strong>No files yet</strong> — click or drop files here.</span>
            </button>
          ) : null}
          {busy && !files?.some((f) => f.id === busy) && <p className="ag_muted ag_small">Reading “{busy}”…</p>}
          {dragging && <div className="ag_dropzone__overlay"><Upload size={20} /> Drop files to give them to the agent</div>}
        </div>
      )}
      {errors.map((e) => <div key={e} className="ag_error">{e}</div>)}
    </section>
  );
};
