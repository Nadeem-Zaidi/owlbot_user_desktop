import { BaseApi } from "@/shared/api/base_fetch";

// A reusable instruction pack (backend core/skills). Only the name and the
// description are sent with each message; the content is loaded on demand.
export type Skill = {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  license?: string | null;
  source?: string | null;
  // Files bundled with the skill (from a skill folder / .zip).
  files?: SkillFile[];
  created_at: string;
  updated_at: string;
};
export type SkillFile = { path: string; kind: "reference" | "script"; bytes: number };
export type SkillSummary = Omit<Skill, "content" | "files"> & { chars: number; file_count?: number };
export type ZipImportResult = Skill & { files: SkillFile[]; skipped: { path: string; reason: string }[] };
export type SkillInput = Pick<Skill, "name" | "description" | "content" | "enabled">;

// Client for /api/skills (backend routes/skill_routes.ts).
class SkillsApi extends BaseApi {
  constructor() {
    super(import.meta.env.VITE_API_URL);
  }
  async list() { return (await this.get<{ skills: SkillSummary[] }>("/skills")).skills; }
  getSkill(id: string) { return this.get<Skill>(`/skills/${encodeURIComponent(id)}`); }
  create(body: SkillInput) { return this.post<Skill>("/skills", body); }
  update(id: string, body: Partial<SkillInput>) { return this.put<Skill>(`/skills/${encodeURIComponent(id)}`, body); }
  remove(id: string) { return this.delete<void>(`/skills/${encodeURIComponent(id)}`); }
  importMarkdown(markdown: string, fileName: string) { return this.post<Skill>("/skills/import", { markdown, fileName }); }
  // A whole skill folder (SKILL.md + reference files + scripts) as a .zip.
  importZip(zipBase64: string, fileName: string) { return this.post<ZipImportResult>("/skills/import-zip", { zip: zipBase64, fileName }); }
  getFile(id: string, path: string) { return this.get<SkillFile & { content: string }>(`/skills/${encodeURIComponent(id)}/file`, { path }); }
  deleteFile(id: string, path: string) { return this.delete<void>(`/skills/${encodeURIComponent(id)}/file`, { path }); }
}

export const skillsApi = new SkillsApi();

// Starting points on an empty library.
export const SKILL_TEMPLATES: SkillInput[] = [
  {
    name: "code-review",
    description: "Reviewing code, a pull request or a diff",
    enabled: true,
    content: "# Code review checklist\n\nWhen reviewing code:\n\n1. **Correctness** — does it do what it claims? Edge cases: empty input, nulls, large data, concurrency.\n2. **Security** — user input validated, no secrets in code, queries parameterised, permissions checked.\n3. **Tests** — new behaviour covered; failing cases tested.\n4. **Readability** — clear names, small functions, comments explain *why*.\n5. **Performance** — no N+1 queries or needless loops on hot paths.\n\nReply with: a one-line verdict, then findings ordered by severity, each with file/line and a suggested fix.",
  },
  {
    name: "meeting-minutes",
    description: "Turning meeting notes or a transcript into minutes",
    enabled: true,
    content: "# Meeting minutes\n\nProduce:\n\n- **Title, date, attendees**\n- **Decisions** (bullets)\n- **Action items** as a table: Owner · Task · Due date\n- **Open questions**\n\nKeep it under one page. Use the attendees' names exactly as written. Don't invent due dates — write \"TBD\".",
  },
];
