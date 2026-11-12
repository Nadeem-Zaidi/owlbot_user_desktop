import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

// The side panel's width (artifacts, file viewer) is the --art-panel-w CSS
// variable; dragging the panel's left edge sets it, and it's remembered.
const KEY = "owl.panelWidth";
const MIN_PANEL = 380;
const MIN_CHAT = 360;

const clamp = (w: number) => Math.round(Math.min(Math.max(w, MIN_PANEL), Math.max(window.innerWidth - MIN_CHAT, MIN_PANEL)));
const apply = (w: number | null) => {
  const root = document.documentElement.style;
  if (w === null) root.removeProperty("--art-panel-w");
  else root.setProperty("--art-panel-w", `${w}px`);
};
const saved = (): number | null => {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
};
const save = (w: number | null) => {
  try {
    if (w === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(w));
  } catch { /* private mode */ }
};

export const PanelResizer = () => {
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState<number | null>(null);   // for aria-valuenow
  const width = useRef<number | null>(null);

  // Restore the remembered width (and keep it valid when the window shrinks).
  useEffect(() => {
    const w = saved();
    width.current = w === null ? null : clamp(w);
    apply(width.current);
    setSize(width.current);
    const onResize = () => { if (width.current !== null) apply(clamp(width.current)); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const current = () => width.current ?? (document.querySelector(".art_panel") as HTMLElement | null)?.getBoundingClientRect().width ?? 640;
  const set = (w: number) => {
    width.current = clamp(w);
    apply(width.current);
    setSize(width.current);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    document.body.classList.add("is_resizing_panel");
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    set(window.innerWidth - e.clientX);
  };
  const stop = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    document.body.classList.remove("is_resizing_panel");
    save(width.current);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 80 : 24;
    if (e.key === "ArrowLeft") set(current() + step);
    else if (e.key === "ArrowRight") set(current() - step);
    else return;
    e.preventDefault();
    save(width.current);
  };
  // Double-click: back to the default width.
  const reset = () => {
    width.current = null;
    apply(null);
    setSize(null);
    save(null);
  };

  return (
    <div
      className={`art_resizer ${dragging ? "is_dragging" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      aria-valuenow={size ?? undefined}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={reset}
      onKeyDown={onKeyDown}
    >
      <span className="art_resizer__grip" />
    </div>
  );
};
