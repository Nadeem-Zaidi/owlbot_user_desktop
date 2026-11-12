import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, FileText, LoaderCircle, Maximize2, Minimize2, X } from "lucide-react";
import { PanelResizer } from "@/features/artifacts/components/panel_resizer";
import { documentsApi, type DocumentPreview, type GeneratedFile, type SheetPreview } from "@/features/documents/api/documents_api";

type Props = { file: GeneratedFile; onClose: () => void };

const sizeLabel = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

const colName = (n: number) => {
  let s = "";
  for (let i = n + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

// A generated Word/Excel file in the chat's side panel (same place as
// artifacts). The Python service turns the file into a preview: Word → an
// HTML page shown in a locked-down iframe, Excel → a cell grid.
export const DocumentViewer = ({ file, onClose }: Props) => {
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(0);
  const [full, setFull] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    documentsApi.preview(file.id)
      .then((p) => { if (!cancelled) setPreview(p); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [file.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (full) setFull(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full, onClose]);

  const download = async () => {
    setDownloading(true);
    try { await documentsApi.download(file); } catch (e) { setError(e instanceof Error ? e.message : "Download failed"); } finally { setDownloading(false); }
  };

  const Icon = file.kind === "excel" ? FileSpreadsheet : FileText;
  const sheets = preview?.kind === "excel" ? preview.sheets : [];
  const current = sheets[Math.min(sheet, sheets.length - 1)];

  return (
    <aside className={`art_panel dv_panel ${full ? "is_full" : ""}`} aria-label={file.filename}>
      <PanelResizer />
      <header className="art_panel__head">
        <div className="art_panel__title">
          <span className={`art_panel__chip art_panel__chip--${file.kind}`} aria-hidden="true"><Icon size={17} /></span>
          <div className="art_panel__heading">
            <strong title={file.filename}>{file.filename}</strong>
            <span className="art_panel__meta">
              {file.kind === "excel" ? "Excel workbook" : "Word document"} · {sizeLabel(file.size)}
              {sheets.length > 1 ? ` · ${sheets.length} sheets` : ""}
            </span>
          </div>
        </div>
        <div className="art_panel__actions">
          <div className="art_toolbar">
            <button type="button" className="dv_download" onClick={() => void download()} disabled={downloading}>
              {downloading ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />} Download
            </button>
            <button type="button" className="art_icon" onClick={() => setFull((f) => !f)} title={full ? "Exit full screen" : "Full screen"} aria-label={full ? "Exit full screen" : "Full screen"}>{full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
          </div>
          <button type="button" className="art_icon art_icon--close" onClick={onClose} title="Close" aria-label="Close"><X size={18} /></button>
        </div>
      </header>

      <div className="art_panel__body">
        {error ? (
          <div className="ag_error art_panel__error">{error}</div>
        ) : !preview ? (
          <div className="art_panel__loading"><LoaderCircle size={18} className="spin" /> Opening {file.kind === "excel" ? "spreadsheet" : "document"}…</div>
        ) : preview.kind === "word" ? (
          // No scripts, no same-origin access; links open in a new tab.
          <iframe className="art_frame dv_word" title={file.filename} sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={preview.html} />
        ) : current ? (
          <>
            <SheetGrid key={current.name} sheet={current} />
            <div className="dv_tabs" role="tablist" aria-label="Sheets">
              {sheets.map((s, i) => (
                <button key={s.name} type="button" role="tab" aria-selected={i === sheet} className={i === sheet ? "is_active" : ""} onClick={() => setSheet(i)}>{s.name}</button>
              ))}
              {current.truncated && <span className="dv_note">Showing the first {current.rows.length.toLocaleString()} of {current.totalRows.toLocaleString()} rows — download for the rest</span>}
            </div>
          </>
        ) : (
          <div className="art_panel__loading">This workbook is empty.</div>
        )}
      </div>
    </aside>
  );
};

const SheetGrid = ({ sheet }: { sheet: SheetPreview }) => {
  const cols = sheet.widths.length;
  return (
    <div className="dv_grid_wrap">
      <table className="dv_grid">
        <colgroup>
          <col style={{ width: 44 }} />
          {sheet.widths.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
        <thead>
          <tr>
            <th className="dv_corner" />
            {Array.from({ length: cols }, (_, i) => <th key={i} className="dv_colhead">{colName(i)}</th>)}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row, r) => (
            <tr key={r} className={r < sheet.frozenRows ? "is_frozen" : ""}>
              <th className="dv_rowhead">{r + 1}</th>
              {row.map((c, i) => (
                <td
                  key={i}
                  title={c?.f ? `${c.f}${c.u ? " (calculated in Excel)" : ""}` : undefined}
                  className={[c?.a === "r" && "is_num", c?.b && "is_bold", c?.i && "is_italic", c?.w && "is_wrap", c?.tt && "is_total", c?.u && "is_formula"].filter(Boolean).join(" ") || undefined}
                  style={c?.bg || c?.fg ? { background: c.bg ? `#${c.bg}` : undefined, color: c.fg ? `#${c.fg}` : undefined } : undefined}
                >
                  {c?.v ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
