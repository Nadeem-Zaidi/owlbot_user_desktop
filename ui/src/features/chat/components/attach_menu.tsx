import { useEffect, useRef, useState } from "react";
import { BookOpenText, Check, FileSpreadsheet, FolderOpen, HardDrive, ImagePlus, Paperclip, Plus, Search } from "lucide-react";

type AttachMenuProps = {
  onFilesSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExplainDocument: () => void;
  onManageKnowledgeBase: () => void;
  kbMode: boolean;
  onToggleKbMode: () => void;
  // Desktop app only: answer from folders indexed on this computer.
  localMode?: boolean;
  onToggleLocalMode?: () => void;
  // Word & Excel tools (an opt-in pack, so other messages stay small).
  docsMode: boolean;
  onToggleDocsMode: () => void;
  disabled?: boolean;
};

// The composer's "+" button: a small popover with every way to add context
// to a message. File inputs live here (hidden) so each item can open the
// picker with its own `accept` filter.
export const AttachMenu = ({
  onFilesSelected,
  onExplainDocument,
  onManageKnowledgeBase,
  kbMode,
  onToggleKbMode,
  localMode,
  onToggleLocalMode,
  docsMode,
  onToggleDocsMode,
  disabled,
}: AttachMenuProps) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div className="attach_menu" ref={rootRef}>
      <button
        type="button"
        className={`composer_icon_btn ${open ? "is_active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add files and more"
        title="Add files and more"
        disabled={disabled}
      >
        <Plus size={18} strokeWidth={2} className="attach_menu__plus" />
      </button>

      {open && (
        <div className="attach_menu__popover" role="menu">
          <button type="button" role="menuitem" className="attach_menu__item" onClick={() => run(() => docInputRef.current?.click())}>
            <span className="attach_menu__icon"><Paperclip size={16} /></span>
            <span className="attach_menu__text">
              <span className="attach_menu__label">Upload files</span>
              <span className="attach_menu__hint">PDF, DOCX, TXT, CSV, JSON</span>
            </span>
          </button>

          <button type="button" role="menuitem" className="attach_menu__item" onClick={() => run(() => imageInputRef.current?.click())}>
            <span className="attach_menu__icon"><ImagePlus size={16} /></span>
            <span className="attach_menu__text">
              <span className="attach_menu__label">Add photos</span>
              <span className="attach_menu__hint">PNG, JPG, WEBP, GIF</span>
            </span>
          </button>

          <div className="attach_menu__divider" role="separator" />

          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={kbMode}
            className="attach_menu__item"
            onClick={() => run(onToggleKbMode)}
          >
            <span className="attach_menu__icon"><Search size={16} /></span>
            <span className="attach_menu__text">
              <span className="attach_menu__label">Search knowledge base</span>
              <span className="attach_menu__hint">Answer from your indexed documents</span>
            </span>
            {kbMode && <Check size={16} className="attach_menu__check" />}
          </button>

          {onToggleLocalMode && (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={!!localMode}
              className="attach_menu__item"
              onClick={() => run(onToggleLocalMode)}
            >
              <span className="attach_menu__icon"><HardDrive size={16} /></span>
              <span className="attach_menu__text">
                <span className="attach_menu__label">Use my local files</span>
                <span className="attach_menu__hint">Answer from folders on this computer</span>
              </span>
              {localMode && <Check size={16} className="attach_menu__check" />}
            </button>
          )}

          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={docsMode}
            className="attach_menu__item"
            onClick={() => run(onToggleDocsMode)}
          >
            <span className="attach_menu__icon"><FileSpreadsheet size={16} /></span>
            <span className="attach_menu__text">
              <span className="attach_menu__label">Create Word &amp; Excel files</span>
              <span className="attach_menu__hint">Let the reply make .docx and .xlsx files</span>
            </span>
            {docsMode && <Check size={16} className="attach_menu__check" />}
          </button>

          <button type="button" role="menuitem" className="attach_menu__item" onClick={() => run(onExplainDocument)}>
            <span className="attach_menu__icon"><BookOpenText size={16} /></span>
            <span className="attach_menu__text">
              <span className="attach_menu__label">Explain a document</span>
              <span className="attach_menu__hint">Pick one and get a detailed walkthrough</span>
            </span>
          </button>

          <div className="attach_menu__divider" role="separator" />

          <button type="button" role="menuitem" className="attach_menu__item" onClick={() => run(onManageKnowledgeBase)}>
            <span className="attach_menu__icon"><FolderOpen size={16} /></span>
            <span className="attach_menu__text">
              <span className="attach_menu__label">Manage knowledge base</span>
            </span>
          </button>
        </div>
      )}

      <input
        ref={docInputRef}
        type="file"
        hidden
        accept=".pdf,.docx,.txt,.md,.csv,.json,.xls,.xlsx"
        multiple
        onChange={onFilesSelected}
      />
      <input ref={imageInputRef} type="file" hidden accept="image/*" multiple onChange={onFilesSelected} />
    </div>
  );
};
