import { useEffect, useSyncExternalStore } from "react";
import { workspacesApi, type WorkspaceSummary } from "@/features/workspaces/api/workspaces_api";
import { activeWorkspaceId, switchWorkspace } from "@/shared/lib/workspace";

// The user's workspaces, loaded once and shared by the sidebar switcher,
// the Agents page and settings. `refreshWorkspaces()` reloads after changes.

let list: WorkspaceSummary[] | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function refreshWorkspaces(): Promise<void> {
  loading = workspacesApi.list()
    .then((w) => {
      list = w;
      // The remembered workspace is gone (left, removed, deleted): go personal.
      const active = activeWorkspaceId();
      if (active && !w.some((x) => x.id === active)) switchWorkspace(null, { goTo: "/chathome" });
    })
    .catch(() => { list = list ?? []; })
    .finally(() => { loading = null; emit(); });
  return loading;
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useWorkspaces() {
  const workspaces = useSyncExternalStore(subscribe, () => list, () => null);
  useEffect(() => { if (list === null && !loading) void refreshWorkspaces(); }, []);
  const activeId = activeWorkspaceId();
  const active = activeId ? workspaces?.find((w) => w.id === activeId) ?? null : null;
  return { workspaces, active, loaded: workspaces !== null };
}
