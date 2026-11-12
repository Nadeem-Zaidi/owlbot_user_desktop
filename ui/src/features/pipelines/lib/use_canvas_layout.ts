import { useCallback, useEffect, useState } from "react";

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode etc. — the setting just isn't remembered
  }
};

// Canvas editors (Workflows, Agent Studio): a focus mode that fills the
// screen, and a side panel that can be hidden (remembered per editor).
export function useCanvasLayout(storageKey: string) {
  const [focus, setFocus] = useState(false);
  const [panel, setPanel] = useState(() => read(`${storageKey}.panel`) !== "closed");

  const togglePanel = useCallback(() => setPanel((p) => {
    write(`${storageKey}.panel`, p ? "closed" : "open");
    return !p;
  }), [storageKey]);
  const openPanel = useCallback(() => setPanel((p) => {
    if (!p) write(`${storageKey}.panel`, "open");
    return true;
  }), [storageKey]);
  const toggleFocus = useCallback(() => setFocus((f) => !f), []);

  // Esc leaves focus mode (unless a dialog is open — Esc closes that first).
  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".ag_backdrop")) setFocus(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focus]);

  return { focus, toggleFocus, panel, togglePanel, openPanel };
}
