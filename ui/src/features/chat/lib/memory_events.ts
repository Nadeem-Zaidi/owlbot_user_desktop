// "Memory updated" notes under a reply, from the assistant's memory tools
// (backend core/memory/memory_tools.ts).
export const MEMORY_TOOLS = new Set(["save_memory", "forget_memory"]);

export type MemoryEvent = { action: "saved" | "proposed" | "forgot"; text: string };

type Json = Record<string, unknown>;

const parse = (raw: unknown): Json | null => {
  if (raw && typeof raw === "object") return raw as Json;
  if (typeof raw !== "string") return null;
  try { return JSON.parse(raw); } catch { return null; }
};

// One tool call + its result → an event (null when nothing was stored, e.g.
// memory is off or the call failed).
export function memoryEvent(toolName: string, args: unknown, output: unknown): MemoryEvent | null {
  const out = parse(output);
  if (!out) return null;
  if (toolName === "forget_memory") {
    return out.forgotten ? { action: "forgot", text: String(out.content ?? "") } : null;
  }
  if (toolName === "save_memory") {
    if (out.status === "proposed") return { action: "proposed", text: String(parse(args)?.content ?? "") };
    if (out.saved && out.status !== "unchanged") return { action: "saved", text: String(parse(args)?.content ?? "") };
  }
  return null;
}

type StoredMessage = { role?: string; tool_call_id?: string; name?: string; arguments?: unknown; output?: unknown };

// Memory changes made in the turn that ends with this assistant message —
// rebuilt from the saved tool calls after a reload.
export function memoryEventsForAssistantMessage(messages: StoredMessage[], assistantIndex: number): MemoryEvent[] {
  let start = 0;
  for (let i = assistantIndex - 1; i >= 0; i--) {
    if (messages[i].role === "user") { start = i + 1; break; }
  }
  const calls: Record<string, { name: string; args: unknown }> = {};
  const events: MemoryEvent[] = [];
  for (let i = start; i < assistantIndex; i++) {
    const m = messages[i];
    if (m.role === "tool_call" && m.tool_call_id && m.name && MEMORY_TOOLS.has(m.name)) calls[m.tool_call_id] = { name: m.name, args: m.arguments };
    if (m.role === "tool_call_output" && m.tool_call_id && calls[m.tool_call_id]) {
      const e = memoryEvent(calls[m.tool_call_id].name, calls[m.tool_call_id].args, m.output);
      if (e) events.push(e);
    }
  }
  return events;
}
