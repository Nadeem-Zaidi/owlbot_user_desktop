// An agent's own files and its skills: what it is given when it runs.
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { SqliteAdapter } from "../../engine/db/sqlite_adapter";
import { AgentFileRepository } from "../../engine/repository/agent_file_repository";
import { SkillRepository } from "../../engine/repository/skill_repository";
import { chunkText, ftsQuery } from "../../engine/service/files/extract_text";
import { parseSkillMarkdown } from "../../engine/service/skills/skill_service";
import { FakeLLM, makeAgent, makeService, USER } from "./fakes";

const names = (run: any): string[] => run.tools.getAll().map((t: any) => t.name);
const call = (run: any, name: string, args: Record<string, unknown>) =>
    run.tools.getAll().find((t: any) => t.name === name).execute(args, { userId: USER });

let db: SqliteAdapter;
let files: AgentFileRepository;
let skills: SkillRepository;

beforeEach(async () => {
    db = new SqliteAdapter(":memory:");
    await db.connect();
    files = new AgentFileRepository(db);
    skills = new SkillRepository(db);
    for (const id of ["a", "b"]) await db.query(`INSERT INTO agents (id, user_id, name) VALUES ($1, $2, $3)`, [id, USER, id]);
});

const service = () => makeService(new FakeLLM(() => ({ text: "ok" })), { extra: { files, skills } }).service;
const addFile = (agentId: string, name: string, content: string) =>
    files.save(agentId, { name, kind: "text", bytes: content.length, content, truncated: false }, chunkText(content));

describe("agent files", () => {
    it("adds file tools and lists the files in the prompt only when the agent has files", async () => {
        const none = await service().buildRun(makeAgent({ id: "a", name: "A" }));
        assert.ok(!names(none).includes("read_file"));

        await addFile("a", "policy.txt", "Refunds within 30 days.");
        const run = await service().buildRun(makeAgent({ id: "a", name: "A" }));
        assert.deepEqual(["list_files", "read_file", "search_files"].filter((n) => names(run).includes(n)), ["list_files", "read_file", "search_files"]);
        assert.match(run.systemPrompt!, /## Your files[\s\S]*policy\.txt/);
    });

    it("drops the shared knowledge-base tools (empty on the desktop) but keeps other built-ins", async () => {
        const run = await service().buildRun(makeAgent({ id: "a", name: "A", builtin_tools: ["search_knowledge_base", "read_document", "list_documents", "current_datetime"] }));
        assert.ok(!names(run).includes("search_knowledge_base"));
        assert.ok(!names(run).includes("read_document"));
        assert.ok(names(run).includes("current_datetime"));
    });

    it("searches only this agent's files, best match first", async () => {
        await addFile("a", "fruit.txt", "Pineapple budget approved.\n\nMeeting on Monday.");
        await addFile("a", "other.txt", "Nothing to see.");
        await addFile("b", "secret.txt", "Pineapple pineapple pineapple.");
        const run = await service().buildRun(makeAgent({ id: "a", name: "A" }));
        const hits = await call(run, "search_files", { query: "pineapples?" });
        assert.equal(hits.length, 1, "porter stemming matches pineapples → pineapple; other agents' files are invisible");
        assert.equal(hits[0].file, "fruit.txt");
    });

    it("reads a file in pages and finds it by a loose name", async () => {
        await addFile("a", "Big Report.md", "x".repeat(70_000));
        const run = await service().buildRun(makeAgent({ id: "a", name: "A" }));
        const first = await call(run, "read_file", { name: "big report" });
        assert.equal(first.content.length, 60_000);
        assert.equal(first.next_offset, 60_000);
        const rest = await call(run, "read_file", { name: "Big Report.md", offset: first.next_offset });
        assert.equal(rest.content.length, 10_000);
        assert.equal(rest.next_offset, undefined);
    });

    it("replaces a file with the same name, and deleting removes it from search", async () => {
        await addFile("a", "n.txt", "alpha");
        const f = await addFile("a", "n.txt", "beta");
        assert.equal((await files.list("a")).length, 1);
        assert.equal((await files.search("a", ftsQuery("alpha")!)).length, 0);
        await files.delete("a", f.id);
        assert.equal((await files.search("a", ftsQuery("beta")!)).length, 0);
    });

    it("drops files with their agent", async () => {
        await addFile("a", "n.txt", "gamma");
        await db.query(`DELETE FROM agents WHERE id = $1`, ["a"]);
        assert.equal((await files.list("a")).length, 0);
        assert.equal((await files.search("a", ftsQuery("gamma")!)).length, 0);
    });
});

describe("agent skills", () => {
    const md = (name: string) => `---\nname: ${name}\ndescription: Use for ${name} tasks\n---\n# ${name}\nSteps for ${name}.`;

    it("parses SKILL.md front matter, including folded descriptions", () => {
        const s = parseSkillMarkdown("---\nname: Invoice Checker\ndescription: >\n  Checks invoices\n  for errors\nlicense: MIT\n---\n# Body\nDo it.", "SKILL.md");
        assert.equal(s.name, "invoice-checker");
        assert.equal(s.description, "Checks invoices for errors");
        assert.equal(s.license, "MIT");
        assert.equal(s.content, "# Body\nDo it.");
    });

    it("offers the selected skills by name and loads one on demand", async () => {
        const s1 = await skills.create(USER, { ...parseSkillMarkdown(md("refunds")), enabled: true });
        await skills.create(USER, { ...parseSkillMarkdown(md("invoices")), enabled: true });
        const run = await service().buildRun(makeAgent({ id: "a", name: "A", skill_mode: "selected", skill_ids: [s1.id] }));
        assert.match(run.systemPrompt!, /## Skills[\s\S]*- refunds: Use for refunds tasks/);
        assert.doesNotMatch(run.systemPrompt!, /invoices/, "unselected skills aren't offered");
        assert.doesNotMatch(run.systemPrompt!, /Steps for refunds/, "only the index is in the prompt");
        const loaded = await call(run, "load_skill", { name: "refunds" });
        assert.match(loaded.instructions, /Steps for refunds/);
        await assert.rejects(call(run, "load_skill", { name: "invoices" }), /No skill named/);
    });

    it("gives all enabled skills in 'all' mode and none in 'none' mode", async () => {
        await skills.create(USER, { ...parseSkillMarkdown(md("one")), enabled: true });
        await skills.create(USER, { ...parseSkillMarkdown(md("off")), enabled: false });
        const all = await service().buildRun(makeAgent({ id: "a", name: "A", skill_mode: "all" }));
        assert.match(all.systemPrompt!, /- one:/);
        assert.doesNotMatch(all.systemPrompt!, /- off:/, "disabled skills are left out");
        const none = await service().buildRun(makeAgent({ id: "a", name: "A", skill_mode: "none" }));
        assert.ok(!names(none).includes("load_skill"));
    });
});
