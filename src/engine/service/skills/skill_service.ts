import path from "node:path";
import { SkillFileRow, SkillInput, SkillRepository, SkillRow } from "../../repository/skill_repository";

// The user's skill library: SKILL.md instruction packs (the format Claude
// skills use: YAML front matter with name + description, then Markdown).
// Agents pick which ones they may use; at run time they see only the names
// and descriptions and load a skill's text when a request matches it.

export class SkillError extends Error {
    constructor(message: string, readonly status = 400) { super(message); }
}

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_CONTENT = 100_000;
const MAX_DESCRIPTION = 1024;
const MAX_ZIP_BYTES = 15 * 1024 * 1024;
const MAX_FILE_BYTES = 300 * 1024;
const MAX_FILES = 60;
const MAX_FILES_TOTAL = 3 * 1024 * 1024;
const SCRIPT_EXTS = new Set([".py", ".sh", ".bash", ".js", ".mjs", ".ts", ".ps1", ".bat", ".rb"]);

type ParsedSkill = { name: string; description: string; content: string; license: string | null };

// "My Skill.md" → "my-skill".
const slug = (s: string) => s.trim().toLowerCase().replace(/\.(md|markdown|txt)$/i, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);

// Just enough YAML for skill front matter: `key: value`, quoted values, and
// folded/literal blocks (`key: >` / `key: |` followed by indented lines).
export function parseFrontMatter(markdown: string): { meta: Record<string, string>; body: string } {
    const text = markdown.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
    if (!m) return { meta: {}, body: text };
    const meta: Record<string, string> = {};
    const lines = m[1].split("\n");
    for (let i = 0; i < lines.length; i++) {
        const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]);
        if (!kv) continue;
        let value = kv[2].trim();
        if (/^[>|][-+]?$/.test(value) || value === "") {
            const block: string[] = [];
            while (i + 1 < lines.length && /^(\s+|$)/.test(lines[i + 1]) && !/^[A-Za-z0-9_-]+:/.test(lines[i + 1])) block.push(lines[++i].trim());
            value = value.startsWith("|") ? block.join("\n") : block.filter(Boolean).join(" ");
        }
        if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1).replace(/\\"/g, '"').replace(/''/g, "'");
        meta[kv[1].toLowerCase()] = value.trim();
    }
    return { meta, body: text.slice(m[0].length) };
}

export function parseSkillMarkdown(markdown: string, fileName = ""): ParsedSkill {
    const { meta, body } = parseFrontMatter(markdown);
    const heading = /^#\s+(.+)$/m.exec(body)?.[1] ?? "";
    const base = path.basename(fileName || "");
    const fromFile = /^skill\.md$/i.test(base) ? "" : base;
    const name = slug(meta.name || fromFile || heading);
    const firstParagraph = body.split(/\n{2,}/).map((p) => p.replace(/^#+\s.*$/gm, "").trim()).find(Boolean) ?? "";
    const description = (meta.description || firstParagraph.replace(/\s+/g, " ")).slice(0, MAX_DESCRIPTION);
    return { name, description, content: body.trim(), license: meta.license || null };
}

function validate(s: { name: string; description: string; content: string }) {
    if (!NAME_RE.test(s.name)) throw new SkillError("Skill names use lowercase letters, numbers, - and _ (e.g. invoice-checker), up to 64 characters. Add `name:` to the SKILL.md front matter.");
    if (!s.description.trim()) throw new SkillError("Add a description — the agent uses it to decide when to load the skill (`description:` in the front matter).");
    if (!s.content.trim()) throw new SkillError("The skill has no instructions.");
    if (s.content.length > MAX_CONTENT) throw new SkillError(`A skill is limited to ${MAX_CONTENT.toLocaleString()} characters.`);
    if (s.description.length > MAX_DESCRIPTION) throw new SkillError(`The description is limited to ${MAX_DESCRIPTION} characters.`);
}

const isUnique = (err: unknown) => /UNIQUE constraint failed/i.test(String((err as Error)?.message ?? err));

export class SkillService {
    constructor(private repo: SkillRepository) {}

    list(userId: string) {
        return this.repo.list(userId);
    }

    async get(userId: string, id: string) {
        const skill = await this.repo.get(userId, id);
        if (!skill) throw new SkillError("Skill not found", 404);
        return { ...skill, files: await this.repo.listFiles(userId, id) };
    }

    async create(userId: string, body: any): Promise<SkillRow> {
        const input: SkillInput = {
            name: slug(String(body?.name ?? "")),
            description: String(body?.description ?? "").trim(),
            content: String(body?.content ?? "").replace(/\r\n/g, "\n"),
            enabled: body?.enabled !== false,
        };
        validate(input);
        return this.insert(() => this.repo.create(userId, input), input.name);
    }

    async update(userId: string, id: string, body: any): Promise<SkillRow> {
        const existing = await this.repo.get(userId, id);
        if (!existing) throw new SkillError("Skill not found", 404);
        const input: SkillInput = {
            name: body?.name !== undefined ? slug(String(body.name)) : existing.name,
            description: body?.description !== undefined ? String(body.description).trim() : existing.description,
            content: body?.content !== undefined ? String(body.content).replace(/\r\n/g, "\n") : existing.content,
            enabled: body?.enabled !== undefined ? !!body.enabled : existing.enabled,
        };
        validate(input);
        const row = await this.insert(() => this.repo.update(userId, id, input), input.name);
        if (!row) throw new SkillError("Skill not found", 404);
        return row;
    }

    async remove(userId: string, id: string) {
        if (!(await this.repo.delete(userId, id))) throw new SkillError("Skill not found", 404);
    }

    async importMarkdown(userId: string, markdown: unknown, fileName: unknown): Promise<SkillRow> {
        if (typeof markdown !== "string" || !markdown.trim()) throw new SkillError("The file is empty.");
        const parsed = parseSkillMarkdown(markdown, typeof fileName === "string" ? fileName : "");
        validate(parsed);
        return this.insert(() => this.repo.create(userId, { ...parsed, enabled: true, source: typeof fileName === "string" ? fileName : null }), parsed.name);
    }

    // A skill folder as .zip: SKILL.md plus reference files and scripts.
    // Scripts are stored for the agent to read; nothing here runs them.
    async importZip(userId: string, zipBase64: unknown, fileName: unknown) {
        if (typeof zipBase64 !== "string" || !zipBase64) throw new SkillError("No .zip was sent.");
        const data = Buffer.from(zipBase64, "base64");
        if (data.length > MAX_ZIP_BYTES) throw new SkillError("The .zip is larger than 15 MB.");
        const { unzipSync } = await import("fflate");
        let entries: Record<string, Uint8Array>;
        try {
            entries = unzipSync(new Uint8Array(data), { filter: (f) => f.originalSize <= MAX_FILE_BYTES * 4 && !f.name.endsWith("/") });
        } catch {
            throw new SkillError("That file isn't a valid .zip.");
        }
        const paths = Object.keys(entries).filter((p) => !/(^|\/)(__MACOSX|\.DS_Store)/.test(p));
        const skillPath = paths.filter((p) => /(^|\/)skill\.md$/i.test(p)).sort((a, b) => a.split("/").length - b.split("/").length)[0];
        if (!skillPath) throw new SkillError("The .zip has no SKILL.md.");
        const root = skillPath.includes("/") ? skillPath.slice(0, skillPath.lastIndexOf("/") + 1) : "";
        const decoder = new TextDecoder("utf-8", { fatal: true });

        const parsed = parseSkillMarkdown(decoder.decode(entries[skillPath]), path.basename(root.slice(0, -1)) || String(fileName ?? ""));
        if (!parsed.name) parsed.name = slug(path.basename(String(fileName ?? ""), ".zip"));
        validate(parsed);

        const files: { path: string; kind: "reference" | "script"; content: string; bytes: number }[] = [];
        const skipped: { path: string; reason: string }[] = [];
        let total = 0;
        for (const p of paths) {
            if (p === skillPath || !p.startsWith(root)) continue;
            const rel = p.slice(root.length);
            const bytes = entries[p].length;
            if (bytes > MAX_FILE_BYTES) { skipped.push({ path: rel, reason: "larger than 300 KB" }); continue; }
            if (files.length >= MAX_FILES || total + bytes > MAX_FILES_TOTAL) { skipped.push({ path: rel, reason: "the skill already has enough files" }); continue; }
            let content: string;
            try {
                content = decoder.decode(entries[p]);
                if (content.includes("\u0000")) throw new Error("binary");
            } catch {
                skipped.push({ path: rel, reason: "not a text file" });
                continue;
            }
            const kind = rel.startsWith("scripts/") || SCRIPT_EXTS.has(path.extname(rel).toLowerCase()) ? "script" : "reference";
            files.push({ path: rel, kind, content, bytes });
            total += bytes;
        }

        const skill = await this.insert(() => this.repo.createWithFiles(userId, { ...parsed, enabled: true, source: typeof fileName === "string" ? fileName : null }, files), parsed.name);
        return { ...skill, files: files.map(({ path: p, kind, bytes }) => ({ path: p, kind, bytes })), skipped };
    }

    async getFile(userId: string, id: string, filePath: unknown): Promise<SkillFileRow> {
        const f = await this.repo.getFile(userId, id, String(filePath ?? ""));
        if (!f) throw new SkillError("File not found", 404);
        return f;
    }

    async deleteFile(userId: string, id: string, filePath: unknown) {
        if (!(await this.repo.deleteFile(userId, id, String(filePath ?? "")))) throw new SkillError("File not found", 404);
    }

    private async insert<T>(fn: () => Promise<T>, name: string): Promise<T> {
        try {
            return await fn();
        } catch (err) {
            if (isUnique(err)) throw new SkillError(`You already have a skill named "${name}". Rename it or delete the old one first.`, 409);
            throw err;
        }
    }
}
