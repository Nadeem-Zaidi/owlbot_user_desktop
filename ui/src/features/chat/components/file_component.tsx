import { useEffect, useState } from "react";
import type { FileAttachment } from "@/shared/types";

export interface FileComponentProps {
  file: FileAttachment;
  index: number;
  upload: boolean;
  fileIdAccumulator: Record<number, { fileId?: string; error?: string } | undefined> | any[];
  removeFile: () => void;
}

const EXT_STYLES: Record<string, { label: string; bg: string; fg: string }> = {
  pdf:  { label: "PDF",  bg: "#F2F2F4", fg: "#555" },
  doc:  { label: "DOC",  bg: "#EAF1FD", fg: "#1D6FE0" },
  docx: { label: "DOC",  bg: "#EAF1FD", fg: "#1D6FE0" },
  csv:  { label: "CSV",  bg: "#EAFAF1", fg: "#0F6E56" },
  xls:  { label: "XLS",  bg: "#EAFAF1", fg: "#0F6E56" },
  xlsx: { label: "XLS",  bg: "#EAFAF1", fg: "#0F6E56" },
  json: { label: "JSON", bg: "#F3EEFD", fg: "#534AB7" },
  txt:  { label: "TXT",  bg: "#F2F2F4", fg: "#555" },
};

function getExtStyle(extension: string) {
  const key = extension.toLowerCase();
  return EXT_STYLES[key] ?? { label: key.slice(0, 4).toUpperCase() || "FILE", bg: "#F2F2F4", fg: "#555" };
}

export const FileComponent = ({ file, index, upload, fileIdAccumulator, removeFile }: FileComponentProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file.isImage && file.file) {
      const url = URL.createObjectURL(file.file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  const record = Array.isArray(fileIdAccumulator) ? fileIdAccumulator[index] : fileIdAccumulator?.[index];
  const isDone = !!record?.fileId;
  const isError = !!record?.error;
  const isUploading = upload && !isDone && !isError;

  const { label, bg, fg } = getExtStyle(file.extension);

  return (
    <div className={`file_card ${isError ? "file_card--error" : ""}`}>
      <button
        type="button"
        className="file_card__remove"
        aria-label={`Remove ${file.name}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          removeFile();
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
          <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </button>

      {previewUrl ? (
        <div className="file_card__preview">
          <img src={previewUrl} alt={file.name} className="file_card__img" />
          {isUploading && (
            <div className="file_card__preview_overlay">
              <span className="file_card__spinner file_card__spinner--light" />
            </div>
          )}
          {isDone && (
            <div className="file_card__done_badge file_card__done_badge--preview">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                <path d="M20 6 9 17l-5-5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
          {isError && (
            <div className="file_card__preview_overlay file_card__preview_overlay--error">!</div>
          )}
        </div>
      ) : (
        <>
          <div className="file_card__name" title={file.name}>{file.name}</div>

          <div className="file_card__footer">
            <span className="file_card__badge" style={{ background: bg, color: fg }}>
              {isUploading ? (
                <span className="file_card__spinner" />
              ) : isError ? (
                "!"
              ) : (
                label
              )}
            </span>
            {isError && <span className="file_card__status file_card__status--error">Failed</span>}
            {isUploading && <span className="file_card__status">Uploading…</span>}
          </div>
        </>
      )}
    </div>
  );
};