import type { LLMMessage } from "@/shared/types";
import { ARTIFACT_TOOLS } from "@/features/artifacts/api/artifacts_api";
import { CHART_TOOL } from "@/features/charts/lib/chart_spec";
import { DOCUMENT_TOOLS } from "@/features/documents/api/documents_api";
import { MEMORY_TOOLS } from "@/features/chat/lib/memory_events";

// What the assistant used to answer — skills it loaded, skill files it
// read, your functions, MCP tools and other agents — as short labels shown
// under the answer. Built live while streaming and rebuilt from the saved
// tool calls after a reload.

export type UsedKind = "skill" | "skill_file" | "function" | "mcp" | "agent" | "tool";
export type UsedItem = { kind: UsedKind; label: string; detail?: string };

// Tools that already show their own card/chips under the answer.
const SHOWN_ELSEWHERE = new Set<string>([
  "search_knowledge_base",          // → Sources chips
  ...ARTIFACT_TOOLS,                // → artifact cards
  CHART_TOOL,                       // → chart card
  ...DOCUMENT_TOOLS,                // → Word / Excel file cards
  ...MEMORY_TOOLS,                  // → memory note
]);

// Built-in tools, in words.
const BUILTIN_LABELS: Record<string, string> = {
  current_datetime: "Date & time",
  list_documents: "Listed documents",
  read_document: "Read a document",
  create_task: "Created a reminder",
  list_tasks: "Checked reminders",
  update_task: "Updated a reminder",
  complete_task: "Completed a reminder",
  delete_task: "Deleted a reminder",
  watch_webpage: "Watching a web page",
  list_watchers: "Checked web watchers",
  stop_watcher: "Stopped a web watcher",
  web_search: "Web search",
  fetch_url: "Read a web page",
};

const parseArgs = (raw: unknown): Record<string, unknown> => {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try { const v = JSON.parse(raw); return v && typeof v === "object" ? v : {}; } catch { return {}; }
};

// "ask_maximo_developer" → "Maximo Developer"
const agentName = (tool: string) => tool.replace(/^ask_/, "").replace(/_\d+$/, "").split("_").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export function describeToolUse(name: string, args?: unknown, serverLabel?: string): UsedItem | null {
  if (!name || SHOWN_ELSEWHERE.has(name) || name === "code_interpreter") return null;
  const a = parseArgs(args);
  if (name === "load_skill") return { kind: "skill", label: String(a.name ?? "skill") };
  if (name === "read_skill_file") return { kind: "skill_file", label: String(a.path ?? "file"), detail: a.skill ? String(a.skill) : undefined };
  if (name.startsWith("ask_")) return { kind: "agent", label: agentName(name) };
  if (serverLabel) return { kind: "mcp", label: name, detail: serverLabel };
  // Agent MCP tools are named "<server>__<tool>".
  const mcp = name.match(/^(.+?)__(.+)$/);
  if (mcp) return { kind: "mcp", label: mcp[2], detail: mcp[1].replace(/[-_]+/g, " ") };
  if (BUILTIN_LABELS[name]) return { kind: "tool", label: BUILTIN_LABELS[name] };
  // Everything else: the user's own HTTP / Python functions.
  return { kind: "function", label: name };
}

export function addUsed(list: UsedItem[], item: UsedItem | null): UsedItem[] {
  if (!item) return list;
  const key = `${item.kind}:${item.label}:${item.detail ?? ""}`;
  return list.some((x) => `${x.kind}:${x.label}:${x.detail ?? ""}` === key) ? list : [...list, item];
}

// From the saved messages of the turn that ends at `assistantIndex`.
export function usedForAssistantMessage(messages: LLMMessage[], assistantIndex: number): UsedItem[] {
  let start = 0;
  for (let i = assistantIndex - 1; i >= 0; i--) {
    if ((messages[i] as { role?: string }).role === "user") { start = i + 1; break; }
  }
  let used: UsedItem[] = [];
  for (let i = start; i < assistantIndex; i++) {
    const m = messages[i] as { role?: string; name?: string; arguments?: unknown };
    if (m.role === "tool_call" && m.name) used = addUsed(used, describeToolUse(m.name, m.arguments));
  }
  return used;
}
