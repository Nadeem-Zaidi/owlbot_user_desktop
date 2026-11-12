import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, LoaderCircle, Search, X } from "lucide-react";
import type { KnowledgeDocument } from "@/shared/types";
import { api } from "@/features/chat/api/chat_api";

// Mount only while open (`{open && <DocumentPicker …/>}`) so each opening
// starts with an empty search and a fresh document list.
type DocumentPickerProps = {
  onClose: () => void;
  onPick: (doc: KnowledgeDocument) => void;
};

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Modal listing every document in the user's knowledge base; picking one
// starts the "explain this document" flow.
export const DocumentPicker = ({ onClose, onPick }: DocumentPickerProps) => {
  const [docs, setDocs] = useState<KnowledgeDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    api.getDocuments()
      .then((list) => !cancelled && setDocs(list))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Couldn't load documents"));
    searchRef.current?.focus();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (docs ?? []).filter((d) => !q || d.name.toLowerCase().includes(q));
  }, [docs, query]);

  return createPortal(
    <div className="doc_picker__backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="doc_picker" role="dialog" aria-modal="true" aria-labelledby="doc_picker_title">
        <div className="doc_picker__header">
          <div>
            <h3 id="doc_picker_title" className="doc_picker__title">Explain a document</h3>
            <p className="doc_picker__subtitle">Choose a document from your knowledge base for a detailed walkthrough.</p>
          </div>
          <button type="button" className="composer_icon_btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <label className="doc_picker__search">
          <Search size={15} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents"
            aria-label="Search documents"
          />
        </label>

        <div className="doc_picker__list">
          {error && <div className="doc_picker__empty doc_picker__empty--error">{error}</div>}
          {!error && docs === null && (
            <div className="doc_picker__empty">
              <LoaderCircle size={18} className="spin" /> Loading documents…
            </div>
          )}
          {!error && docs !== null && filtered.length === 0 && (
            <div className="doc_picker__empty">
              {docs.length === 0 ? "Your knowledge base is empty. Upload documents from “Manage knowledge base”." : "No documents match your search."}
            </div>
          )}
          {filtered.map((doc) => (
            <button
              key={doc.key}
              type="button"
              className="doc_picker__item"
              onClick={() => {
                onPick(doc);
                onClose();
              }}
            >
              <span className="doc_picker__item_icon"><FileText size={16} /></span>
              <span className="doc_picker__item_text">
                <span className="doc_picker__item_name">{doc.name}</span>
                <span className="doc_picker__item_meta">
                  {doc.chunks} section{doc.chunks === 1 ? "" : "s"}
                  {formatDate(doc.updatedAt) && ` · ${formatDate(doc.updatedAt)}`}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.getElementById("modal-root") ?? document.body
  );
};
