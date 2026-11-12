import { useSyncExternalStore } from "react";

// The active space: a team workspace's id, or null for the personal one.
// Every API call sends it as "X-Workspace-Id" (see workspaceHeaders), so the
// server knows whose agents and knowledge base the request is about.
// Remembered per browser; switching reloads the app so every page refetches.

const KEY = "owl_workspace";
const AFTER_LOGIN = "owl_after_login";

const read = (): string | null => {
  try {
    const v = localStorage.getItem(KEY);
    return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
  } catch {
    return null;
  }
};

let active: string | null = typeof window !== "undefined" ? read() : null;
const listeners = new Set<() => void>();

export const activeWorkspaceId = () => active;

export function workspaceHeaders(): Record<string, string> {
  return active ? { "X-Workspace-Id": active } : {};
}

// Switches space. `reload` (default) restarts the app on `goTo` so nothing
// from the previous space stays on screen.
export function switchWorkspace(id: string | null, opts: { reload?: boolean; goTo?: string } = {}) {
  active = id;
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch { /* storage blocked: this tab still switches */ }
  listeners.forEach((l) => l());
  if (opts.reload !== false) window.location.assign(opts.goTo ?? window.location.pathname);
}

// The server said we're no longer a member (removed, or the workspace was
// deleted): fall back to the personal space.
export function onWorkspaceForbidden() {
  if (!active) return;
  switchWorkspace(null, { goTo: "/chathome" });
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useActiveWorkspaceId = () => useSyncExternalStore(subscribe, () => active, () => null);

// Pages opened while signed out (e.g. an invite link) — reopened after sign-in.
export function rememberAfterLogin(path: string) {
  try { if (path && path !== "/") sessionStorage.setItem(AFTER_LOGIN, path); } catch { /* ignore */ }
}
export function takeAfterLogin(): string | null {
  try {
    const p = sessionStorage.getItem(AFTER_LOGIN);
    sessionStorage.removeItem(AFTER_LOGIN);
    return p && p.startsWith("/") && !p.startsWith("//") ? p : null;
  } catch {
    return null;
  }
}
