import { useEffect, useState } from "react";
import { api } from "@/features/chat/api/chat_api";
import type { CodeInterpreterFileRef } from "@/shared/types";

export interface CodeInterpreterCardProps {
  code: string;
  status?: string; // "in_progress" | "interpreting" | "completed" | "failed"
  done: boolean;
  files: CodeInterpreterFileRef[];
}

function isImageFilename(name?: string) {
  if (!name) return false;
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(name);
}

const CodeInterpreterFileItem = ({ file }: { file: CodeInterpreterFileRef }) => {
  // file.url is a persisted S3 copy the backend made the moment this file
  // was generated (see persistCodeInterpreterFile in openai_provider.ts) —
  // when it's there, use it directly and skip the live OpenAI-container
  // fetch entirely, since that container is gone ~20 min after generation.
  // Only messages saved before this existed lack a url and need the old
  // live-fetch path below.
  const hasPersistedUrl = Boolean(file.url);
  const [previewUrl, setPreviewUrl] = useState<string | null>(file.url ?? null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const likelyImage = isImageFilename(file.filename);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    if (likelyImage && !hasPersistedUrl) {
      (async () => {
        try {
          const { blob } = await api.getCodeInterpreterFile(file.container_id, file.file_id, file.filename);
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setPreviewUrl(objectUrl);
          setPreviewBlob(blob);
        } catch (err: any) {
          if (!cancelled) setError(err?.message ?? "Failed to load file");
        }
      })();
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.container_id, file.file_id, hasPersistedUrl]);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      if (hasPersistedUrl && file.url) {
        // Direct S3 link — no need to round-trip through our own server.
        const a = document.createElement("a");
        a.href = file.url;
        a.download = file.filename ?? file.file_id;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      // Reuse the already-fetched preview blob when we have one instead of
      // fetching the file a second time — also sidesteps a container that
      // expired in the gap between preview and download.
      const { blob, filename } = previewBlob
        ? { blob: previewBlob, filename: file.filename ?? file.file_id }
        : await api.getCodeInterpreterFile(file.container_id, file.file_id, file.filename);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoking synchronously right after click() can race the download
      // start in some browsers — defer it a tick so the download reliably
      // has the blob URL available.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      setError(err?.message ?? "Failed to download file");
    } finally {
      setDownloading(false);
    }
  };

  const openFullSize = () => {
    if (previewUrl) window.open(previewUrl, "_blank", "noopener,noreferrer");
  };

  if (likelyImage) {
    return (
      <div className="ci-file ci-file--image">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={file.filename ?? "Generated image"}
            className="ci-file__img"
            onClick={openFullSize}
            title="Click to view full size"
          />
        ) : error ? (
          <div className="ci-file__error">{error}</div>
        ) : (
          <div className="ci-file__loading">Loading image…</div>
        )}
        <div className="ci-file__footer">
          <span className="ci-file__name">{file.filename ?? file.file_id}</span>
          <button type="button" className="ci-file__download-btn" onClick={handleDownload} disabled={downloading}>
            {downloading ? "Downloading…" : "Download"}
          </button>
        </div>
        {error && previewUrl && <div className="ci-file__error">{error}</div>}
      </div>
    );
  }

  return (
    <button type="button" className="ci-file ci-file--doc" onClick={handleDownload} disabled={downloading}>
      <span className="ci-file__icon">{(file.filename?.split(".").pop() ?? "FILE").slice(0, 4).toUpperCase()}</span>
      <span className="ci-file__name">{file.filename ?? file.file_id}</span>
      <span className="ci-file__action">{downloading ? "Downloading…" : error ? error : "Download"}</span>
    </button>
  );
};

const STATUS_LABEL: Record<string, string> = {
  in_progress: "Writing code…",
  interpreting: "Running…",
  completed: "Done",
  failed: "Failed",
};

export const CodeInterpreterCard = ({ code, status, done, files }: CodeInterpreterCardProps) => {
  const [expanded, setExpanded] = useState(!done);

  useEffect(() => {
    if (done) setExpanded(false);
  }, [done]);

  return (
    <div className={`code-interpreter-card ${done ? "done" : ""} ${status === "failed" ? "failed" : ""}`}>
      <button type="button" className="code-interpreter-card__header" onClick={() => setExpanded((v) => !v)}>
        <span className="code-interpreter-card__icon" aria-hidden="true">{"</>"}</span>
        <span className="code-interpreter-card__title">Code Interpreter</span>
        <span className="code-interpreter-card__status">
          <span className={`ci-status-dot ${done ? (status === "failed" ? "failed" : "done") : "running"}`} />
          {STATUS_LABEL[status ?? "in_progress"] ?? status}
        </span>
        <span className="code-interpreter-card__chevron">{expanded ? "▾" : "▸"}</span>
      </button>

      {expanded && code && (
        <pre className="code-interpreter-card__code">
          <code>{code}</code>
        </pre>
      )}

      {files.length > 0 && (
        <div className="code-interpreter-card__files">
          {files.map((f) => (
            <CodeInterpreterFileItem key={`${f.container_id}-${f.file_id}`} file={f} />
          ))}
        </div>
      )}
    </div>
  );
};
