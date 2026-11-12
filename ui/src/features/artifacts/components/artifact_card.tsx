import { Code2, FileText, LoaderCircle } from "lucide-react";
import type { ArtifactKind } from "@/features/artifacts/api/artifacts_api";

type Props = {
  title: string;
  kind?: ArtifactKind;
  version?: number;
  pending?: boolean;         // the model is still writing it
  open?: boolean;            // shown in the side panel right now
  onToggle?: () => void;
};

const KIND_LABEL: Record<ArtifactKind, string> = { html: "Web page", markdown: "Document" };

// The card in the chat for a document/report the assistant created; opens it
// in the side panel.
export const ArtifactCard = ({ title, kind, version, pending, open, onToggle }: Props) => (
  <div className={`art_card ${open ? "is_open" : ""} ${pending ? "is_pending" : ""}`}>
    <button type="button" className="art_card__main" onClick={onToggle} disabled={pending} aria-pressed={open}>
      <span className="art_card__icon" aria-hidden="true">
        {pending ? <LoaderCircle size={18} className="spin" /> : kind === "html" ? <Code2 size={18} /> : <FileText size={18} />}
      </span>
      <span className="art_card__text">
        <span className="art_card__title">{pending ? "Writing document…" : title}</span>
        <span className="art_card__meta">
          {pending ? "This can take a minute for long documents" : `${kind ? KIND_LABEL[kind] : "Document"}${version && version > 1 ? ` · version ${version}` : ""}`}
        </span>
      </span>
    </button>
    {!pending && (
      <button type="button" className="art_card__toggle" onClick={onToggle}>
        {open ? "Hide" : "Open"}
      </button>
    )}
  </div>
);
