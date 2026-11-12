import { useState } from "react";
import { Download, FileSpreadsheet, FileText, LoaderCircle } from "lucide-react";
import { documentsApi, type GeneratedFile } from "@/features/documents/api/documents_api";

const size = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

// A Word/Excel file the assistant made, under its reply. While the file is
// still being built, `pending` shows a placeholder.
type Props = { file?: GeneratedFile; pending?: boolean; kind?: "word" | "excel"; open?: boolean; onOpen?: () => void };

export const GeneratedFileCard = ({ file, pending, kind, open, onOpen }: Props) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const k = file?.kind ?? kind ?? "word";
  const Icon = k === "excel" ? FileSpreadsheet : FileText;

  const download = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await documentsApi.download(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`gf_card gf_card--${k} ${pending ? "is_pending" : ""} ${open ? "is_open" : ""}`}>
      <button type="button" className="gf_card__open" onClick={onOpen} disabled={pending || !onOpen} aria-pressed={open} title={pending ? undefined : open ? "Close preview" : "Open preview"}>
        <span className="gf_card__icon"><Icon size={20} /></span>
        <span className="gf_card__main">
          <strong className="gf_card__name">{pending ? `Creating ${k === "excel" ? "Excel file" : "Word document"}…` : file?.filename}</strong>
          <span className="gf_card__meta">
            {pending ? "Building the file" : `${k === "excel" ? "Excel" : "Word"} · ${size(file?.size ?? 0)}`}
            {error && <span className="gf_card__error"> · {error}</span>}
          </span>
        </span>
      </button>
      {pending ? (
        <LoaderCircle size={18} className="spin gf_card__spin" />
      ) : (
        <button type="button" className="gf_card__btn" onClick={() => void download()} disabled={busy} aria-label={`Download ${file?.filename}`}>
          {busy ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />} Download
        </button>
      )}
    </div>
  );
};
