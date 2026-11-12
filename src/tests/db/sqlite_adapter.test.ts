// The SQLite adapter: what the Postgres-era repositories rely on.
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { SqliteAdapter } from "../../engine/db/sqlite_adapter";

let db: SqliteAdapter;
beforeEach(async () => {
    db = new SqliteAdapter(":memory:");
    await db.connect();
});

describe("sqlite adapter", () => {
    it("creates the whole schema", async () => {
        const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM sqlite_master WHERE type = 'table'`);
        assert.ok(rows[0].n >= 30);
    });

    it("stores JSON, booleans and dates, and reads them back as they were", async () => {
        const when = new Date("2026-11-12T10:00:00.000Z");
        const { rows } = await db.query(
            `INSERT INTO agents (id, user_id, name, builtin_tools, limits, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            ["a1", "u", "Agent", JSON.stringify(["search_knowledge_base"]), { max_rounds: 5 }, when]);
        const a = rows[0];
        assert.deepEqual(a.builtin_tools, ["search_knowledge_base"]);
        assert.deepEqual(a.limits, { max_rounds: 5 });
        assert.ok(a.created_at instanceof Date && a.created_at.getTime() === when.getTime());
        await db.query(`INSERT INTO agent_functions (id, agent_id, name, method, url, enabled) VALUES ($1, $2, $3, 'GET', 'https://x', $4)`, ["f1", "a1", "fn", false]);
        const f = (await db.query(`SELECT enabled FROM agent_functions WHERE id = $1`, ["f1"])).rows[0];
        assert.equal(f.enabled, false);
    });

    it("fills defaults the Postgres way (ids, now(), JSON arrays)", async () => {
        await db.query(`INSERT INTO agents (id, user_id, name) VALUES ('a2', 'u', 'X')`);
        const a = (await db.query(`SELECT * FROM agents WHERE id = 'a2'`)).rows[0];
        assert.deepEqual(a.starters, []);
        assert.equal(a.skill_mode, "all");
        assert.ok(Date.now() - a.created_at.getTime() < 5_000);
    });

    it("reuses a parameter, strips casts, and maps ILIKE", async () => {
        await db.query(`INSERT INTO agents (id, user_id, name) VALUES ('a3', 'u', 'Report Writer')`);
        const { rows } = await db.query(`SELECT id FROM agents WHERE user_id = $1::text AND ($2::text IS NULL OR name ILIKE $3) AND user_id = $1`, ["u", "x", "%report%"]);
        assert.deepEqual(rows.map((r) => r.id), ["a3"]);
    });

    it("rolls a transaction back on error", async () => {
        await assert.rejects(db.withTransaction(async () => {
            await db.query(`INSERT INTO agents (id, user_id, name) VALUES ('t1', 'u', 'T')`);
            throw new Error("boom");
        }), /boom/);
        assert.equal((await db.query(`SELECT * FROM agents WHERE id = 't1'`)).rowCount, 0);
    });

    it("keeps other work out of an open transaction (one connection)", async () => {
        const order: string[] = [];
        let release!: () => void;
        const gate = new Promise<void>((r) => { release = r; });
        const tx = db.withTransaction(async () => {
            await db.query(`INSERT INTO agents (id, user_id, name) VALUES ('t2', 'u', 'T')`);
            order.push("tx wrote");
            await gate;
            order.push("tx done");
        });
        await new Promise((r) => setTimeout(r, 10));
        const outside = db.query(`SELECT count(*)::int AS n FROM agents`).then((r) => { order.push(`outside saw ${r.rows[0].n}`); });
        await new Promise((r) => setTimeout(r, 20));
        release();
        await Promise.all([tx, outside]);
        assert.deepEqual(order, ["tx wrote", "tx done", "outside saw 1"]);
    });

    it("cascades deletes (foreign keys are on)", async () => {
        await db.query(`INSERT INTO agents (id, user_id, name) VALUES ('a4', 'u', 'X')`);
        await db.query(`INSERT INTO agent_functions (id, agent_id, name, method, url) VALUES ('f4', 'a4', 'fn', 'GET', 'https://x')`);
        await db.query(`DELETE FROM agents WHERE id = 'a4'`);
        assert.equal((await db.query(`SELECT * FROM agent_functions WHERE id = 'f4'`)).rowCount, 0);
    });
});
