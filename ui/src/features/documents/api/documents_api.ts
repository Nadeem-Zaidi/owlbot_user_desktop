import { BaseApi } from "@/shared/api/base_fetch";
import { workspaceHeaders } from "@/shared/lib/workspace";

// Word/Excel files the assistant created (backend core/documents).
export type GeneratedFile = { id: string; kind: "word" | "excel"; filename: string; size: number };

// What the viewer shows (built by the Python service; see backend documents/preview).
export type SheetCell = { v?: string; f?: string; u?: 1; a?: "r"; b?: 1; i?: 1; w?: 1; tt?: 1; bg?: string; fg?: string } | null;
export type SheetPreview = { name: string; widths: number[]; rows: SheetCell[][]; frozenRows: number; totalRows: number; totalCols: number; truncated: boolean };
export type DocumentPreview = { kind: "word"; html: string } | { kind: "excel"; sheets: SheetPreview[] };

export type DocumentStyle = {
  company: string;
  color: string;
  font: string;
  footer: string;
  currency: string;
  hasLogo: boolean;
  fonts?: string[];
};

// Client for /api/documents (backend routes/document_routes.ts).
class DocumentsApi extends BaseApi {
  constructor() {
    super(import.meta.env.VITE_API_URL);
  }

  style() { return this.get<DocumentStyle>("/documents/style"); }
  saveStyle(body: Partial<DocumentStyle>) { return this.put<DocumentStyle>("/documents/style", body); }
  saveLogo(dataUrl: string) { return this.put<DocumentStyle>("/documents/style/logo", { image: dataUrl }); }
  preview(id: string) { return this.get<DocumentPreview>(`/documents/${encodeURIComponent(id)}/preview`); }
  removeLogo() { return this.delete<DocumentStyle>("/documents/style/logo"); }

  // Authenticated binary fetches (a plain link can't carry the token).
  private async blob(path: string): Promise<Blob> {
    const headers = await this.getHeader();
    const res = await fetch(`${this.baseUrl}${path}`, { headers: { Authorization: headers.Authorization, ...workspaceHeaders() } });
    if (!res.ok) {
      let message = "Download failed";
      try { message = (await res.json()).message ?? message; } catch { /* not JSON */ }
      throw new Error(message);
    }
    return res.blob();
  }

  async download(file: GeneratedFile): Promise<void> {
    const blob = await this.blob(`/documents/${encodeURIComponent(file.id)}/download`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  logoUrl() { return this.blob("/documents/style/logo").then((b) => URL.createObjectURL(b)); }
}

export const documentsApi = new DocumentsApi();

export const DOCUMENT_TOOLS = new Set(["create_word_document", "create_excel_file"]);

type Json = Record<string, unknown>;
const parse = (raw: unknown): Json | null => {
  if (raw && typeof raw === "object") return raw as Json;
  if (typeof raw !== "string") return null;
  try { return JSON.parse(raw); } catch { return null; }
};

// A tool result → the file it created (null when the call failed).
export function generatedFileFrom(output: unknown): GeneratedFile | null {
  const f = parse(output)?.generated_file as GeneratedFile | undefined;
  return f && typeof f.id === "string" && typeof f.filename === "string" ? f : null;
}

type StoredMessage = { role?: string; tool_call_id?: string; name?: string; output?: unknown };

// Files created in the turn that ends with this assistant message (after a reload).
export function filesForAssistantMessage(messages: StoredMessage[], assistantIndex: number): GeneratedFile[] {
  let start = 0;
  for (let i = assistantIndex - 1; i >= 0; i--) {
    if (messages[i].role === "user") { start = i + 1; break; }
  }
  const names: Record<string, string> = {};
  const files: GeneratedFile[] = [];
  for (let i = start; i < assistantIndex; i++) {
    const m = messages[i];
    if (m.role === "tool_call" && m.tool_call_id && m.name) names[m.tool_call_id] = m.name;
    if (m.role === "tool_call_output" && m.tool_call_id && DOCUMENT_TOOLS.has(names[m.tool_call_id])) {
      const f = generatedFileFrom(m.output);
      if (f) files.push(f);
    }
  }
  return files;
}
