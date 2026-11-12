import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { DatabaseSync, StatementSync } from "node:sqlite";
import { IDatabaseAdapter, QueryResult } from "../database/idatabaseadapter";
import { SCHEMA } from "./schema";
import { BOOL_NAMES, COLUMN_KINDS, ColumnKind, DATE_NAMES, JSON_NAMES } from "./schema_types";

// The app's one database: a SQLite file on this computer.
//
// The repositories were written for Postgres and are kept as they are; this
// adapter covers the differences, and only these:
//   - $1, $2 … parameters are bound by name (SQLite reads "$1" as a named
//     parameter, so a value can be used several times, as in Postgres).
//   - Casts (::int, ::jsonb …) are removed; ILIKE becomes LIKE; GREATEST /
//     LEAST become max / min; row locks (FOR UPDATE) are dropped — there is
//     one connection.
//   - now() and gen_random_uuid() exist as SQL functions.
//   - Values in: objects and arrays are stored as JSON text, booleans as 0/1,
//     dates as ISO-8601 UTC text. Values out: converted back by the column
//     they came from (schema_types.ts).
// Anything else Postgres-only (intervals, date_trunc …) is rewritten in the
// repository that used it.

type Prepared = { stmt: StatementSync; names: string[]; reads: boolean; kinds: (ColumnKind | null)[] | null };

const iso = () => new Date().toISOString();

function translate(sql: string): string {
    return sql
        .replace(/::[a-zA-Z_]+(\[\])?/g, "")
        .replace(/\bILIKE\b/gi, "LIKE")
        .replace(/\bGREATEST\s*\(/gi, "max(")
        .replace(/\bLEAST\s*\(/gi, "min(")
        .replace(/\s+FOR UPDATE(\s+SKIP LOCKED)?/gi, "");
}

function encode(v: unknown): any {
    if (v === undefined || v === null) return null;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (v instanceof Date) return v.toISOString();
    if (Buffer.isBuffer(v) || v instanceof Uint8Array) return v;
    if (typeof v === "object") return JSON.stringify(v);
    return v;
}

function decode(kind: ColumnKind, v: unknown): unknown {
    if (v === null || v === undefined) return null;
    if (kind === "bool") return !!v;
    if (kind === "date") return typeof v === "string" ? new Date(v) : v;
    if (typeof v !== "string") return v;
    try {
        return JSON.parse(v);
    } catch {
        return v;
    }
}

const byName = (name: string): ColumnKind | null =>
    JSON_NAMES.has(name) ? "json" : BOOL_NAMES.has(name) ? "bool" : DATE_NAMES.has(name) ? "date" : null;

export class SqliteAdapter implements IDatabaseAdapter {
    private db: DatabaseSync | null = null;
    private prepared = new Map<string, Prepared>();
    // One connection: a transaction owns it until it ends. Queries from the
    // transaction's own call chain run inside it; everything else waits.
    private tx = new AsyncLocalStorage<symbol>();
    private owner: symbol | null = null;
    private idle: Promise<void> = Promise.resolve();

    // ":memory:" for tests.
    constructor(private file: string) {}

    async connect(): Promise<void> {
        const db = new DatabaseSync(this.file);
        db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
        db.function("now", iso);
        db.function("gen_random_uuid", () => randomUUID());
        db.exec(SCHEMA);
        this.db = db;
    }

    async disconnect(): Promise<void> {
        this.prepared.clear();
        this.db?.close();
        this.db = null;
    }

    isConnected(): boolean {
        return !!this.db;
    }

    // Repositories branch on this for SQL they share with the server.
    getType(): string {
        return "PostgreSQL";
    }

    isInTransaction(): boolean {
        return this.owner !== null && this.tx.getStore() === this.owner;
    }

    getTransactionClient(): any {
        return null;
    }

    private prepare(sql: string): Prepared {
        let p = this.prepared.get(sql);
        if (p) return p;
        const text = translate(sql);
        const stmt = this.db!.prepare(text);
        const names = [...new Set(text.match(/\$\d+/g) ?? [])];
        const reads = /^\s*(SELECT|WITH|PRAGMA)\b/i.test(text) || /\bRETURNING\b/i.test(text);
        let kinds: Prepared["kinds"] = null;
        if (reads) {
            kinds = (stmt as any).columns().map((c: { table: string | null; column: string | null; name: string }) => (c.table && c.column ? COLUMN_KINDS[c.table]?.[c.column] ?? null : byName(c.name)));
            if (!kinds!.some(Boolean)) kinds = null;
        }
        p = { stmt, names, reads, kinds };
        if (this.prepared.size > 500) this.prepared.clear();
        this.prepared.set(sql, p);
        return p;
    }

    private run<T>(sql: string, params?: any[]): QueryResult<T> {
        if (!this.db) throw new Error("The database isn't open");
        const p = this.prepare(sql);
        const bound: Record<string, any> = {};
        for (const n of p.names) bound[n] = encode(params?.[Number(n.slice(1)) - 1]);
        if (!p.reads) {
            const r = p.stmt.run(bound);
            return { rows: [], rowCount: Number(r.changes) };
        }
        const raw = p.stmt.all(bound) as Record<string, unknown>[];
        const cols = p.kinds ? ((p.stmt as any).columns() as { name: string }[]).map((c) => c.name) : null;
        const rows = raw.map((r) => {
            const row: Record<string, unknown> = { ...r };
            if (cols) p.kinds!.forEach((k, i) => { if (k) row[cols[i]] = decode(k, row[cols[i]]); });
            return row as T;
        });
        return { rows, rowCount: rows.length };
    }

    async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
        // Wait while another call chain's transaction is open.
        while (this.owner !== null && this.tx.getStore() !== this.owner) await this.idle;
        return this.run<T>(sql, params);
    }

    async withTransaction<T>(callback: () => Promise<T>): Promise<T> {
        if (this.isInTransaction()) return callback();          // already inside one: join it
        while (this.owner !== null) await this.idle;
        const me = Symbol("tx");
        let release!: () => void;
        this.idle = new Promise<void>((r) => { release = r; });
        this.owner = me;
        try {
            this.db!.exec("BEGIN IMMEDIATE");
            const value = await this.tx.run(me, callback);
            this.db!.exec("COMMIT");
            return value;
        } catch (err) {
            try { this.db!.exec("ROLLBACK"); } catch { /* nothing open */ }
            throw err;
        } finally {
            this.owner = null;
            release();
        }
    }

    async executeTransactionQueries<T = any>(queries: Array<{ sql: string; params?: any[] }>): Promise<QueryResult<T>[]> {
        return this.withTransaction(async () => queries.map((q) => this.run<T>(q.sql, q.params)));
    }

    // The explicit begin/commit API isn't used by this app's repositories
    // (they all go through withTransaction), and can't be made safe on one
    // connection without a call-chain to tie the statements to.
    async beginTransaction(): Promise<void> { throw new Error("Use withTransaction"); }
    async commit(): Promise<void> { throw new Error("Use withTransaction"); }
    async rollback(): Promise<void> { throw new Error("Use withTransaction"); }
}
