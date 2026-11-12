import { BaseApi } from "@/shared/api/base_fetch";

// ── Export / import files (backend core/portable) ──
export type ImportPreview = {
  exported_at: string;
  agents: {
    ref: string;
    name: string;
    icon: string;
    description: string;
    existing: { id: string; name: string } | null;
    tools: number;
    functions: number;
    mcp_servers: { name: string; url: string; needs_token: boolean; tools: number }[];
    secret_headers: { function: string; header: string; key: string }[];
    skills_to_create: string[];
    missing_documents: string[];
    warnings: string[];
  }[];
  projects: { name: string; final_name: string; trigger_note?: string }[];
};

export type AgentChoice = {
  mode: "create" | "existing";
  existing_id?: string;
  mcp_tokens?: Record<string, string>;
  skip_mcp?: string[];
  secrets?: Record<string, string>;
};

export type ImportResult = {
  agents: { ref: string; id: string; name: string; created: boolean }[];
  projects: { id: string; name: string }[];
  warnings: string[];
};

// Client for /api/portable (backend routes/portable_routes.ts).
class PortableApi extends BaseApi {
  constructor() {
    super(import.meta.env.VITE_API_URL);
  }

  exportAgent(id: string) { return this.get<Record<string, unknown>>(`/portable/agents/${id}/export`); }
  exportProject(id: string) { return this.get<Record<string, unknown>>(`/portable/studio/${id}/export`); }
  preview(file: unknown) { return this.post<ImportPreview>("/portable/import/preview", { file }); }
  import(file: unknown, choices: { agents: Record<string, AgentChoice> }) { return this.post<ImportResult>("/portable/import", { file, choices }); }
}

export const portableApi = new PortableApi();

// Saves an export as "<name>.owlbot.json" on the user's computer.
export function downloadJson(data: unknown, name: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "export"}.owlbot.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
