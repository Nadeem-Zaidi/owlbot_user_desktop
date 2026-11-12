import { useEffect, useState } from "react";
import { automationsApi } from "@/features/automations/api/automations_api";

// Unread alerts count for the sidebar (checked every minute).
export const UnreadAlertsBadge = () => {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => automationsApi.unread().then((v) => { if (alive) setN(v); }).catch(() => {});
    const cleared = () => setN(0);
    void load();
    const t = setInterval(load, 60_000);
    window.addEventListener("owl:alerts-read", cleared);
    return () => { alive = false; clearInterval(t); window.removeEventListener("owl:alerts-read", cleared); };
  }, []);
  return n > 0 ? <span className="rm_badge" aria-label={`${n} unread alerts`}>{n > 99 ? "99+" : n}</span> : null;
};
