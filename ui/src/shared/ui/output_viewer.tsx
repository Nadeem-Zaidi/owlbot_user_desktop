import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, Maximize2, Minus, Plus, X } from "lucide-react";
import { MarkdownOutput } from "@/features/chat/components/markdown_output";

// A long answer (a workflow's final output…) on the whole screen, with zoom.
// Ctrl + mouse wheel and Ctrl +/−/0 zoom too; Esc closes.

const MIN = 0.6;
const MAX = 2.5;
const STEP = 0.1;
const ZOOM_KEY = "owl_output_zoom";

const clamp = (z: number) => Math.min(MAX, Math.max(MIN, Math.round(z * 10) / 10));

function savedZoom(): number {
  try {
    const z = Number(localStorage.getItem(ZOOM_KEY));
    return z ? clamp(z) : 1.2;
  } catch {
    return 1.2;
  }
}

export const OutputViewer = ({ title, text, onClose }: { title: string; text: string; onClose: () => void }) => {
  const [zoom, setZoomState] = useState(savedZoom);
  const [copied, setCopied] = useState(false);

  const setZoom = useCallback((next: number | ((z: number) => number)) => {
    setZoomState((cur) => {
      const z = clamp(typeof next === "function" ? next(cur) : next);
      try { localStorage.setItem(ZOOM_KEY, String(z)); } catch { /* not saved */ }
      return z;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.ctrlKey || e.metaKey) {
        if (e.key === "=" || e.key === "+") { e.preventDefault(); setZoom((z) => z + STEP); }
        else if (e.key === "-") { e.preventDefault(); setZoom((z) => z - STEP); }
        else if (e.key === "0") { e.preventDefault(); setZoom(1); }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, setZoom]);

  // A native listener: React's wheel handlers are passive and can't stop
  // the browser zooming the whole page on Ctrl + wheel.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => z + (e.deltaY < 0 ? STEP : -STEP));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoom]);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "output"}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };

  return createPortal(
    <div className="ov_backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="ov_bar">
        <strong className="ov_title">{title}</strong>
        <div className="ov_zoom" role="group" aria-label="Zoom">
          <button type="button" className="ag_icon_btn" onClick={() => setZoom((z) => z - STEP)} disabled={zoom <= MIN} aria-label="Zoom out" title="Zoom out (Ctrl −)"><Minus size={16} /></button>
          <button type="button" className="ov_zoom__value" onClick={() => setZoom(1)} title="Reset zoom (Ctrl 0)">{Math.round(zoom * 100)}%</button>
          <button type="button" className="ag_icon_btn" onClick={() => setZoom((z) => z + STEP)} disabled={zoom >= MAX} aria-label="Zoom in" title="Zoom in (Ctrl +)"><Plus size={16} /></button>
        </div>
        <button type="button" className="ag_icon_btn" onClick={() => void copy()} aria-label="Copy" title="Copy">{copied ? <Check size={16} /> : <Copy size={16} />}</button>
        <button type="button" className="ag_icon_btn" onClick={download} aria-label="Download as Markdown" title="Download .md"><Download size={16} /></button>
        <button type="button" className="ag_icon_btn" onClick={onClose} aria-label="Close" title="Close (Esc)"><X size={18} /></button>
      </div>
      <div className="ov_scroll" ref={scrollRef}>
        <div className="ov_page" style={{ zoom }}>
          <MarkdownOutput text={text} />
        </div>
      </div>
    </div>,
    document.getElementById("modal-root") ?? document.body
  );
};

// The "Expand" button that opens the viewer.
export const ExpandOutputButton = ({ title, text }: { title: string; text: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="ag_icon_btn" onClick={() => setOpen(true)} aria-label="Open full screen" title="Full screen & zoom">
        <Maximize2 size={15} />
      </button>
      {open && <OutputViewer title={title} text={text} onClose={() => setOpen(false)} />}
    </>
  );
};
