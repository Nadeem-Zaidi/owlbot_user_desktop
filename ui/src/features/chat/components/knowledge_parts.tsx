import { FileText, LoaderCircle, Sparkles } from "lucide-react";
import type { TextContent } from "@/shared/types";
import { displayName } from "@/features/chat/lib/chat_utils";

// The whole document travels to the model as one text part; in the chat it
// shows as a compact card instead of thousands of characters of raw text.
export const DocumentCard = ({ part }: { part: TextContent }) => {
  const name = part.documentName ?? "Document";
  const chars = part.totalChars ?? part.text.length;
  const words = Math.round(chars / 6);
  return (
    <div className="doc_card" title={name}>
      <span className="doc_card__icon"><FileText size={18} /></span>
      <span className="doc_card__text">
        <span className="doc_card__name">{name}</span>
        <span className="doc_card__meta">
          From knowledge base · ~{words.toLocaleString()} words
          {part.truncated && " · first part only"}
        </span>
      </span>
    </div>
  );
};

type SourceChipsProps = {
  sources: string[];
  onExplain: (key: string) => void;
  loadingKey: string | null;
  disabled?: boolean;
};

// RAG sources under an answer. Clicking one sends that document's full text
// back to the model with a request to explain it in detail.
export const SourceChips = ({ sources, onExplain, loadingKey, disabled }: SourceChipsProps) => (
  <div className="message_sources">
    <span className="sources_label">Sources</span>
    {sources.map((key) => {
      const isLoading = loadingKey === key;
      return (
        <button
          key={key}
          type="button"
          className="source_chip"
          onClick={() => onExplain(key)}
          disabled={disabled || !!loadingKey}
          title={`Explain “${displayName(key)}” in detail`}
        >
          {isLoading ? <LoaderCircle size={13} className="spin" /> : <FileText size={13} />}
          <span className="source_chip__name">{displayName(key)}</span>
          <span className="source_chip__action">
            <Sparkles size={12} /> Explain
          </span>
        </button>
      );
    })}
  </div>
);
