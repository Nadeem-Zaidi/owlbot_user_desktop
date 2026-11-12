// The Owl app (Electron) exposes window.owlDesktop. In a normal
// browser it's absent, and every desktop-only feature stays hidden.

export type LocalFolder = {
  id: number;
  path: string;
  name: string;
  status: "idle" | "indexing" | "error" | "missing";
  error: string | null;
  fileCount: number;
  chunkCount: number;
  skippedCount: number;
  lastIndexedAt: string | null;
  createdAt: string;
};

export type LocalFile = {
  id: number;
  folderId: number;
  relPath: string;
  size: number;
  chunkCount: number;
  skipped: string | null;
  indexedAt: string;
};

export type LocalHit = {
  fileId: number;
  folderId: number;
  path: string;
  relPath: string;
  folderName: string;
  text: string;
  snippet: string;
  score: number;
};

export type IndexProgress = {
  folderId: number;
  phase: "scanning" | "indexing" | "done" | "error";
  done: number;
  total: number;
  current?: string;
  message?: string;
};

export type KnowledgeStats = { folders: number; files: number; chunks: number; dbBytes: number };

// A command an agent wants to run on this computer (from the chat stream).
export type LocalCommandRequest = {
  requestId: string;
  command: string;
  shell: "powershell" | "cmd" | "bash";
  cwd: string | null;
  reason: string;
  timeoutMinutes: number;
};

// What the desktop app answers; posted back to the server as-is.
export type LocalCommandResult =
  | { status: "ran"; exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; durationMs: number }
  | { status: "denied" }
  | { status: "unavailable"; message: string };

export type DesktopBridge = {
  version: string;
  platform: string;
  // Window title bar + background follow the app theme (shared/lib/theme.ts).
  setTheme?(t: { id: string; dark: boolean; background: string }): void;
  knowledge: {
    listFolders(): Promise<LocalFolder[]>;
    addFolder(): Promise<LocalFolder | null>;
    removeFolder(id: number): Promise<boolean>;
    reindex(id?: number): Promise<boolean>;
    stats(): Promise<KnowledgeStats>;
    search(query: string, limit?: number, folderIds?: number[]): Promise<LocalHit[]>;
    listFiles(folderId: number): Promise<LocalFile[]>;
    openFile(fileId: number): Promise<boolean>;
    revealFile(fileId: number): Promise<boolean>;
    onProgress(cb: (p: IndexProgress) => void): () => void;
    onChanged(cb: () => void): () => void;
  };
  // Older desktop versions don't have it.
  commands?: {
    enabled(): Promise<boolean>;
    run(request: LocalCommandRequest): Promise<LocalCommandResult>;
  };
};

export const desktop: DesktopBridge | null =
  typeof window !== "undefined" ? ((window as unknown as { owlDesktop?: DesktopBridge }).owlDesktop ?? null) : null;

export const isDesktop = desktop !== null;

// Electron wraps errors as "Error invoking remote method 'x': Error: <msg>".
export function desktopError(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : "";
  const clean = msg.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, "").trim();
  return clean || fallback;
}

// Sent with each chat message when the desktop app allows local commands, so
// the server offers the agent its run_local_command tool.
export async function localCommandHeaders(): Promise<Record<string, string>> {
  try {
    if (desktop?.commands && (await desktop.commands.enabled())) return { "X-Owl-Desktop": `shell; platform=${desktop.platform}` };
  } catch { /* older app or IPC refused: no local commands */ }
  return {};
}
