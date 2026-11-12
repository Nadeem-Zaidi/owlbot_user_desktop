import { Fragment, useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ExternalLink, FileText, FolderOpen, FolderPlus, HardDrive, Laptop, RefreshCw, Search, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, ErrorNote } from "@/shared/ui/ui";
import { ago } from "@/features/automations/api/automations_api";
import { knowledgeDesktop as desktop, desktopError, type IndexProgress, type KnowledgeStats, type LocalFile, type LocalFolder, type LocalHit } from "@/shared/lib/desktop";

const bytes = (n: number) => n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;

// "[[match]]" markers from the local search, shown as <mark>.
const Snippet = ({ text }: { text: string }) => (
  <>{text.split(/(\[\[.*?\]\])/g).map((s, i) => s.startsWith("[[") && s.endsWith("]]") ? <mark key={i}>{s.slice(2, -2)}</mark> : <Fragment key={i}>{s}</Fragment>)}</>
);

// Desktop only: folders on this computer that Owl indexes privately
// (in a local SQLite file) and can search when you chat.
export const LocalKnowledgePage = () => {
  const [folders, setFolders] = useState<LocalFolder[] | null>(null);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [progress, setProgress] = useState<Record<number, IndexProgress>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [files, setFiles] = useState<LocalFile[] | null>(null);
  const [removing, setRemoving] = useState<LocalFolder | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LocalHit[] | null>(null);

  const load = useCallback(async () => {
    if (!desktop) return;
    const [f, s] = await Promise.all([desktop.knowledge.listFolders(), desktop.knowledge.stats()]);
    setFolders(f);
    setStats(s);
  }, []);

  useEffect(() => {
    if (!desktop) return;
    load().catch((e) => setError(desktopError(e, "Couldn't load your local folders")));
    const offProgress = desktop.knowledge.onProgress((p) => {
      setProgress((prev) => ({ ...prev, [p.folderId]: p }));
      if (p.phase === "done" || p.phase === "error") void load().catch(() => {});
    });
    const offChanged = desktop.knowledge.onChanged(() => { void load().catch(() => {}); });
    return () => { offProgress(); offChanged(); };
  }, [load]);

  // Refresh the open folder's file list when its counts change.
  const openFolder = folders?.find((f) => f.id === open);
  const openKey = openFolder ? `${openFolder.id}:${openFolder.fileCount}:${openFolder.skippedCount}:${openFolder.lastIndexedAt}` : "";
  useEffect(() => {
    if (!desktop || open === null) { setFiles(null); return; }
    desktop.knowledge.listFiles(open).then(setFiles).catch(() => setFiles([]));
  }, [open, openKey]);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(desktopError(e, "Something went wrong"));
    } finally {
      setBusy(null);
    }
  };

  const search = () => act("search", async () => {
    if (!desktop || !query.trim()) { setHits(null); return; }
    setHits(await desktop.knowledge.search(query, 8));
  });

  if (!desktop) {
    return (
      <div className="ag_page">
        <header className="ag_page__header">
          <div>
            <h1 className="ag_page__title">Local knowledge</h1>
            <p className="ag_page__subtitle">Let Owl answer from folders on your own computer.</p>
          </div>
        </header>
        <div className="lk_empty">
          <Laptop size={28} />
          <p><strong>This needs the Owl app.</strong></p>
          <p className="ag_muted">A web page can't read folders on your computer. In the desktop app you can pick folders, and Owl keeps a private index of them on your PC.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ag_page">
      <header className="ag_page__header">
        <div>
          <h1 className="ag_page__title">Local knowledge</h1>
          <p className="ag_page__subtitle">
            Folders on this computer that Owl can search when you chat. The index stays on your PC — only the few passages
            that match a question are sent with that message.
          </p>
        </div>
        <Button variant="primary" busy={busy === "add"} onClick={() => void act("add", () => desktop!.knowledge.addFolder())}>
          <FolderPlus size={15} /> Add folder
        </Button>
      </header>

      {stats && (
        <p className="lk_stats ag_muted ag_small">
          <HardDrive size={13} /> {stats.folders} folder{stats.folders === 1 ? "" : "s"} · {stats.files.toLocaleString()} files · {stats.chunks.toLocaleString()} passages · {bytes(stats.dbBytes)} on disk
        </p>
      )}
      <ErrorNote message={error} />

      {folders === null ? <div className="ag_card ag_card--skeleton" /> : folders.length === 0 ? (
        <div className="lk_empty">
          <FolderOpen size={28} />
          <p><strong>No folders yet</strong></p>
          <p className="ag_muted">Add a folder of notes, documents or code. Owl reads Word, Excel, PowerPoint, text, Markdown, CSV, JSON, HTML and code files, and keeps the index up to date as files change.</p>
          <Button variant="primary" busy={busy === "add"} onClick={() => void act("add", () => desktop!.knowledge.addFolder())}><FolderPlus size={15} /> Add a folder</Button>
        </div>
      ) : (
        <ul className="lk_list">
          {folders.map((f) => {
            const p = progress[f.id];
            const indexing = f.status === "indexing" || (p && (p.phase === "scanning" || p.phase === "indexing"));
            const pct = p && p.total ? Math.round((p.done / p.total) * 100) : 0;
            const isOpen = open === f.id;
            return (
              <li key={f.id} className={`lk_folder ${f.status === "error" || f.status === "missing" ? "is_bad" : ""}`}>
                <div className="lk_folder__row">
                  <span className="lk_folder__icon"><FolderOpen size={18} /></span>
                  <div className="lk_folder__text">
                    <strong>{f.name}</strong>
                    <span className="lk_path" title={f.path}>{f.path}</span>
                    <span className="ag_muted ag_small">
                      {indexing ? (p?.phase === "indexing" ? `Indexing ${p.done.toLocaleString()} of ${p.total.toLocaleString()}…` : "Looking for files…")
                        : `${f.fileCount.toLocaleString()} files · ${f.chunkCount.toLocaleString()} passages${f.skippedCount ? ` · ${f.skippedCount} skipped` : ""} · updated ${ago(f.lastIndexedAt)}`}
                    </span>
                  </div>
                  <div className="lk_folder__actions">
                    <Button variant="ghost" title="Re-index now" aria-label={`Re-index ${f.name}`} disabled={!!indexing} onClick={() => void act(`re${f.id}`, () => desktop!.knowledge.reindex(f.id))}>
                      <RefreshCw size={15} className={indexing ? "spin" : ""} />
                    </Button>
                    <Button variant="ghost" aria-expanded={isOpen} aria-label={`Show files in ${f.name}`} onClick={() => setOpen(isOpen ? null : f.id)}>
                      Files <ChevronDown size={14} className={`lk_chev ${isOpen ? "is_open" : ""}`} />
                    </Button>
                    <Button variant="ghost" title="Remove" aria-label={`Remove ${f.name}`} onClick={() => setRemoving(f)}><Trash2 size={15} /></Button>
                  </div>
                </div>
                {indexing && p?.phase === "indexing" && (
                  <div className="lk_progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Indexing ${f.name}`}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                )}
                {indexing && p?.current && <span className="lk_current ag_small ag_muted">{p.current}</span>}
                {!indexing && f.error && <p className="lk_warn"><AlertTriangle size={14} /> {f.error}</p>}
                {isOpen && (
                  <div className="lk_files">
                    {files === null ? <p className="ag_muted ag_small">Loading…</p> : files.length === 0 ? <p className="ag_muted ag_small">No supported files found.</p> : (
                      <ul>
                        {files.map((x) => (
                          <li key={x.id} className={x.skipped ? "is_skipped" : ""}>
                            <FileText size={13} />
                            <button type="button" className="lk_file" onClick={() => void act(`open${x.id}`, () => desktop!.knowledge.openFile(x.id))} title="Open">{x.relPath}</button>
                            <span className="ag_muted ag_small">{x.skipped ?? `${bytes(x.size)} · ${x.chunkCount} passage${x.chunkCount === 1 ? "" : "s"}`}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {folders && folders.length > 0 && (
        <section className="lk_try">
          <h2 className="rm_h3"><Search size={15} /> Try a search</h2>
          <form className="lk_try__bar" onSubmit={(e) => { e.preventDefault(); void search(); }}>
            <input className="ag_input" value={query} placeholder="e.g. escalation policy for priority 1 work orders" aria-label="Search your local files" onChange={(e) => setQuery(e.target.value)} />
            <Button type="submit" busy={busy === "search"} disabled={!query.trim()}>Search</Button>
          </form>
          <p className="ag_muted ag_small">In chat, turn on <strong>Use my local files</strong> from the + menu to answer from these folders.</p>
          {hits && (hits.length === 0 ? <p className="ag_muted">Nothing matched.</p> : (
            <ul className="lk_hits">
              {hits.map((h, i) => (
                <li key={`${h.fileId}-${i}`}>
                  <button type="button" className="lk_file" onClick={() => void act(`open${h.fileId}`, () => desktop!.knowledge.openFile(h.fileId))}>
                    {h.folderName}/{h.relPath} <ExternalLink size={12} />
                  </button>
                  <p className="lk_snippet"><Snippet text={h.snippet} /></p>
                </li>
              ))}
            </ul>
          ))}
        </section>
      )}

      {removing && (
        <ConfirmDialog
          title="Remove this folder?"
          message={<>Owl will forget “{removing.name}” and delete its index from this computer. Your files aren't touched.</>}
          confirmLabel="Remove"
          busy={busy === "remove"}
          onCancel={() => setRemoving(null)}
          onConfirm={() => void act("remove", async () => {
            await desktop!.knowledge.removeFolder(removing.id);
            if (open === removing.id) setOpen(null);
            setRemoving(null);
          })}
        />
      )}
    </div>
  );
};
