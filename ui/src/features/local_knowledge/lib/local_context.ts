import type { TextContent } from "@/shared/types";
import { desktop, type LocalHit } from "@/shared/lib/desktop";

// "Use my local files" in chat: search the desktop app's local index for the
// message and send the best passages along as hidden context. Only these
// passages leave the computer — the files themselves never do.

const MAX_CONTEXT_CHARS = 12_000;
const MAX_HITS = 6;

export function formatLocalContext(question: string, hits: LocalHit[]): string {
  if (!hits.length) {
    return "[Owl searched the user's local files on their computer for this message and found nothing relevant. " +
      "Say so briefly if the question depends on their files.]";
  }
  const head =
    "[Context from the user's local files (found on their computer by Owl desktop for: " +
    `"${question.slice(0, 200).replace(/\s+/g, " ")}"). Use it to answer when relevant, and cite the file names you used, ` +
    "e.g. (notes.md). If these passages don't answer the question, say so instead of guessing.]";
  const parts: string[] = [head];
  let used = head.length;
  hits.forEach((h, i) => {
    const block = `\n\n--- [${i + 1}] ${h.folderName}/${h.relPath}\n${h.text}`;
    if (used + block.length > MAX_CONTEXT_CHARS) return;
    parts.push(block);
    used += block.length;
  });
  return parts.join("");
}

export async function localContextPart(question: string): Promise<{ part: TextContent; hits: LocalHit[] } | null> {
  if (!desktop || !question.trim()) return null;
  const hits = await desktop.knowledge.search(question, MAX_HITS).catch(() => [] as LocalHit[]);
  return { part: { type: "text", hidden: true, text: formatLocalContext(question, hits) } as TextContent, hits };
}
