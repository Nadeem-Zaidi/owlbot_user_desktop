import { AgentFileRepository, AgentFileSummary } from "../../repository/agent_file_repository";
import { SkillRepository, SkillRow } from "../../repository/skill_repository";
import { ftsQuery } from "../files/extract_text";
import { ToolDefinition } from "../../types/type";

// Tools for an agent's own files and its skills (desktop app).

export const FILE_TOOL_NAMES = ["list_files", "read_file", "search_files"] as const;
export const SKILL_TOOL_NAMES = ["load_skill", "read_skill_file"] as const;

const READ_CHARS = 60_000;

export function agentFileTools(repo: AgentFileRepository, agentId: string): ToolDefinition[] {
    const findFile = async (name: unknown) => {
        const f = await repo.find(agentId, String(name ?? ""));
        if (!f) throw new Error(`No file named "${name}". Call list_files to see the names.`);
        return f;
    };
    return [
        {
            name: "list_files",
            description: "Lists the files the user gave you (name, type, length in characters).",
            parameters: { type: "object", properties: {}, required: [] },
            parallel: true,
            execute: async () => {
                const files = await repo.list(agentId);
                return { files: files.map((f) => ({ name: f.name, type: f.kind, characters: f.chars, ...(f.truncated ? { truncated: true } : {}) })) };
            },
        },
        {
            name: "read_file",
            description: `Returns the text of one of your files, ${READ_CHARS.toLocaleString()} characters at a time. Spreadsheets come as CSV per sheet, PDFs page by page. If the result has next_offset, call again with it to read on.`,
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string", description: "File name, e.g. report.pdf" },
                    offset: { type: "integer", description: "Character to start from (default 0)" },
                },
                required: ["name"],
            },
            parallel: true,
            execute: async (args) => {
                const f = await findFile(args.name);
                const offset = Math.max(0, Math.floor(Number(args.offset) || 0));
                const end = Math.min(f.content.length, offset + READ_CHARS);
                return {
                    name: f.name,
                    type: f.kind,
                    total_characters: f.content.length,
                    from: offset,
                    to: end,
                    ...(end < f.content.length ? { next_offset: end } : {}),
                    ...(f.truncated ? { note: "Only the start of this file was kept (it is very large)." } : {}),
                    content: f.content.slice(offset, end),
                };
            },
        },
        {
            name: "search_files",
            description: "Keyword search across your files. Returns the best-matching passages and which file each came from. Use specific words that would appear in the text.",
            parameters: {
                type: "object",
                properties: { query: { type: "string", description: "Words to look for" } },
                required: ["query"],
            },
            parallel: true,
            execute: async (args) => {
                const match = ftsQuery(String(args.query ?? ""));
                if (!match) throw new Error("Give some words to search for.");
                const hits = await repo.search(agentId, match, 8);
                if (!hits.length) return "No passages matched. Try other words, or read_file to read a file directly.";
                return hits.map((h) => ({ file: h.name, passage: h.content }));
            },
        },
    ];
}

export function filesPrompt(files: AgentFileSummary[]): string {
    if (!files.length) return "";
    const list = files.slice(0, 50).map((f) => `- ${f.name} (${f.kind}, ${f.chars.toLocaleString()} characters)`).join("\n");
    const more = files.length > 50 ? `\n…and ${files.length - 50} more (list_files shows all).` : "";
    return `## Your files\nThe user gave you these files. Use search_files to find passages and read_file to read one; say which file an answer came from.\n${list}${more}`;
}

export type SkillScope = { mode: "all" | "selected" | "none"; ids: string[] };

// The skills an agent may use: the owner's enabled ones, filtered by the agent's choice.
export async function resolveSkills(repo: SkillRepository, userId: string, scope: SkillScope): Promise<Omit<SkillRow, "content">[]> {
    if (scope.mode === "none") return [];
    const all = await repo.list(userId, true);
    return scope.mode === "selected" ? all.filter((s) => scope.ids.includes(s.id)) : all;
}

export function skillsPrompt(skills: Omit<SkillRow, "content">[]): string {
    if (!skills.length) return "";
    const list = skills.slice(0, 100).map((s) => `- ${s.name}: ${s.description}`).join("\n");
    return `## Skills\nYou have these skills (instruction packs). When a request matches one, call load_skill with its name FIRST and follow what it says. Don't load skills that don't apply.\n${list}`;
}

export function skillTools(repo: SkillRepository, userId: string, skills: Omit<SkillRow, "content">[]): ToolDefinition[] {
    if (!skills.length) return [];
    const names = skills.map((s) => s.name);
    const byName = async (name: unknown) => {
        const wanted = String(name ?? "").trim().toLowerCase();
        if (!names.includes(wanted)) throw new Error(`No skill named "${name}". Available: ${names.join(", ")}`);
        const s = await repo.getByName(userId, wanted);
        if (!s) throw new Error(`The skill "${name}" was removed.`);
        return s;
    };
    const tools: ToolDefinition[] = [{
        name: "load_skill",
        description: "Loads the full instructions of one of your skills. Call it before doing a task the skill covers.",
        parameters: {
            type: "object",
            properties: { name: { type: "string", enum: names, description: "The skill's name" } },
            required: ["name"],
        },
        parallel: true,
        execute: async (args) => {
            const s = await byName(args.name);
            const files = await repo.listFiles(userId, s.id);
            return {
                name: s.name,
                instructions: s.content,
                ...(files.length ? { files: files.map((f) => `${f.path} (${f.kind})`), note: "Read these with read_skill_file when the instructions refer to them. Scripts can't be run here; read them for reference." } : {}),
            };
        },
    }];
    if (skills.some((s: any) => Number(s.file_count) > 0)) {
        tools.push({
            name: "read_skill_file",
            description: "Reads a reference file or script that comes with a skill (listed by load_skill).",
            parameters: {
                type: "object",
                properties: {
                    skill: { type: "string", enum: names, description: "The skill's name" },
                    path: { type: "string", description: "File path as listed by load_skill, e.g. reference/forms.md" },
                },
                required: ["skill", "path"],
            },
            parallel: true,
            execute: async (args) => {
                const s = await byName(args.skill);
                const f = await repo.getFile(userId, s.id, String(args.path ?? ""));
                if (!f) throw new Error(`"${args.path}" isn't one of the files of ${s.name}.`);
                return { path: f.path, content: f.content.slice(0, READ_CHARS) };
            },
        });
    }
    return tools;
}
