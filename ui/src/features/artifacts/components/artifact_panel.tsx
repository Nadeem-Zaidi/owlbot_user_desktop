import { useEffect, useMemo, useState } from "react";
import { Check, Code2, Copy, Download, ExternalLink, FileText, LoaderCircle, Maximize2, Minimize2, X } from "lucide-react";
import { PanelResizer } from "@/features/artifacts/components/panel_resizer";
import { BotMessage } from "@/features/chat/components/bot_message";
import { artifactsApi, type Artifact } from "@/features/artifacts/api/artifacts_api";
import { escapeAttr, sandboxedHtml } from "@/features/artifacts/lib/sandbox";

const fileName = (title: string, ext: string) => `${title.replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 80) || "document"}.${ext}`;

type Props = {
  artifactId: string;
  version?: number;
  onClose: () => void;
};

// Mount with key={id + refresh counter}: a new document or version remounts it.

export const ArtifactPanel = ({ artifactId, version, onClose }: Props) => {
  const [art, setArt] = useState<Artifact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [selected, setSelected] = useState<number | undefined>(version);
  const [copied, setCopied] = useState(false);
  const [full, setFull] = useState(false);

  useEffect(() => {
    let cancelled = false;
    artifactsApi.load(artifactId, selected)
      .then((a) => { if (!cancelled) setArt(a); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [artifactId, selected]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (full) setFull(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full, onClose]);

  const srcDoc = useMemo(() => (art?.kind === "html" ? sandboxedHtml(art.content) : ""), [art]);

  const copy = async () => {
    if (!art) return;
    try {
      await navigator.clipboard.writeText(art.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setTab("code");
    }
  };

  const download = () => {
    if (!art) return;
    const isHtml = art.kind === "html";
    const blob = new Blob([art.content], { type: isHtml ? "text/html;charset=utf-8" : "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName(art.title, isHtml ? "html" : "md");
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // A new tab with the page in the same sandbox (never as a document of this app's origin).
  const openInTab = () => {
    if (!art || art.kind !== "html") return;
    const wrapper = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeAttr(art.title)}</title>
<style>html,body,iframe{margin:0;width:100%;height:100%;border:0;display:block}</style></head>
<body><iframe sandbox="allow-scripts" srcdoc="${escapeAttr(sandboxedHtml(art.content))}"></iframe></body></html>`;
    const url = URL.createObjectURL(new Blob([wrapper], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <aside className={`art_panel ${full ? "is_full" : ""}`} aria-label="Document">
      <PanelResizer />
      <header className="art_panel__head">
        <div className="art_panel__title">
          <span className={`art_panel__chip art_panel__chip--${art?.kind ?? "html"}`} aria-hidden="true">
            {art?.kind === "markdown" ? <FileText size={17} /> : <Code2 size={17} />}
          </span>
          <div className="art_panel__heading">
            <strong title={art?.title}>{art?.title ?? "Loading…"}</strong>
            <span className="art_panel__meta">
              {art ? (art.kind === "html" ? "Web page" : "Document") : ""}
              {art && art.versions.length <= 1 && art.version > 1 ? ` · v${art.version}` : ""}
          {art && art.versions.length > 1 && (
            <select
              id="art_version"
              className="art_panel__version"
              value={art.version}
              onChange={(e) => { setError(null); setSelected(Number(e.target.value)); }}
              aria-label="Version"
            >
              {art.versions.map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version}{v.version === art.currentVersion ? " (latest)" : ""}{v.changeSummary ? ` — ${v.changeSummary}` : ""}
                </option>
              ))}
            </select>
          )}
            </span>
          </div>
        </div>
        <div className="art_panel__actions">
          <div className="art_tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "preview"} className={tab === "preview" ? "is_active" : ""} onClick={() => setTab("preview")}>Preview</button>
            <button type="button" role="tab" aria-selected={tab === "code"} className={tab === "code" ? "is_active" : ""} onClick={() => setTab("code")}>{art?.kind === "markdown" ? "Markdown" : "Code"}</button>
          </div>
          <div className="art_toolbar">
            <button type="button" className="art_icon" onClick={() => void copy()} title="Copy" aria-label="Copy" disabled={!art}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
            <button type="button" className="art_icon" onClick={download} title="Download" aria-label="Download" disabled={!art}><Download size={16} /></button>
            {art?.kind === "html" && <button type="button" className="art_icon" onClick={openInTab} title="Open in a new tab" aria-label="Open in a new tab"><ExternalLink size={16} /></button>}
            <button type="button" className="art_icon" onClick={() => setFull((f) => !f)} title={full ? "Exit full screen" : "Full screen"} aria-label={full ? "Exit full screen" : "Full screen"}>{full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
          </div>
          <button type="button" className="art_icon art_icon--close" onClick={onClose} title="Close" aria-label="Close"><X size={18} /></button>
        </div>
      </header>

      <div className="art_panel__body">
        {error ? (
          <div className="ag_error art_panel__error">{error}</div>
        ) : !art ? (
          <div className="art_panel__loading"><LoaderCircle size={18} className="spin" /> Loading…</div>
        ) : tab === "code" ? (
          <pre className="art_code"><code>{art.content}</code></pre>
        ) : art.kind === "html" ? (
          <iframe className="art_frame" title={art.title} sandbox="allow-scripts" srcDoc={srcDoc} />
        ) : (
          <article className="art_doc"><BotMessage text={art.content} /></article>
        )}
      </div>
    </aside>
  );
};
