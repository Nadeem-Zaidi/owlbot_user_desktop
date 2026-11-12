import { randomUUID } from "node:crypto";
import { IDatabaseAdapter } from "../database/idatabaseadapter";
import { FileKind } from "../service/files/extract_text";

export type AgentFileRow = {
    id: string;
    agent_id: string;
    name: string;
    kind: FileKind;
    bytes: number;
    chars: number;
    content: string;
    truncated: boolean;
    created_at: Date;
};
export type AgentFileSummary = Omit<AgentFileRow, "content">;
export type FileHit = { name: string; seq: number; content: string };

// Files given to one agent (desktop only). Callers check the agent's access.
export class AgentFileRepository {
    constructor(private db: IDatabaseAdapter) {}

    async list(agentId: string): Promise<AgentFileSummary[]> {
        const { rows } = await this.db.query<AgentFileSummary>(
            `SELECT id, agent_id, name, kind, bytes, chars, truncated, created_at FROM agent_files WHERE agent_id = $1 ORDER BY name`, [agentId]);
        return rows;
    }

    async get(agentId: string, id: string): Promise<AgentFileRow | null> {
        const { rows } = await this.db.query<AgentFileRow>(`SELECT * FROM agent_files WHERE agent_id = $1 AND id = $2`, [agentId, id]);
        return rows[0] ?? null;
    }

    // Exact name first, then case-insensitive, then a partial match.
    async find(agentId: string, name: string): Promise<AgentFileRow | null> {
        const wanted = name.trim().toLowerCase();
        const { rows } = await this.db.query<AgentFileRow>(`SELECT * FROM agent_files WHERE agent_id = $1`, [agentId]);
        return rows.find((f) => f.name === name) ?? rows.find((f) => f.name.toLowerCase() === wanted) ?? rows.find((f) => f.name.toLowerCase().includes(wanted)) ?? null;
    }

    // A file with the same name is replaced.
    async save(agentId: string, f: { name: string; kind: FileKind; bytes: number; content: string; truncated: boolean }, chunks: string[]): Promise<AgentFileSummary> {
        return this.db.withTransaction(async () => {
            await this.db.query(`DELETE FROM agent_files WHERE agent_id = $1 AND name = $2`, [agentId, f.name]);
            const id = randomUUID();
            await this.db.query(
                `INSERT INTO agent_files (id, agent_id, name, kind, bytes, chars, content, truncated) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [id, agentId, f.name, f.kind, f.bytes, f.content.length, f.content, f.truncated]);
            for (let i = 0; i < chunks.length; i++) {
                await this.db.query(`INSERT INTO agent_file_chunks (content, file_id, agent_id, seq) VALUES ($1,$2,$3,$4)`, [chunks[i], id, agentId, i]);
            }
            const { rows } = await this.db.query<AgentFileSummary>(
                `SELECT id, agent_id, name, kind, bytes, chars, truncated, created_at FROM agent_files WHERE id = $1`, [id]);
            return rows[0];
        });
    }

    async delete(agentId: string, id: string): Promise<boolean> {
        const r = await this.db.query(`DELETE FROM agent_files WHERE agent_id = $1 AND id = $2`, [agentId, id]);
        return r.rowCount > 0;
    }

    // `match` is an FTS5 query (see ftsQuery). Best first.
    async search(agentId: string, match: string, limit = 8): Promise<FileHit[]> {
        const { rows } = await this.db.query<FileHit>(
            `SELECT f.name AS name, agent_file_chunks.seq AS seq, agent_file_chunks.content AS content
             FROM agent_file_chunks JOIN agent_files f ON f.id = agent_file_chunks.file_id
             WHERE agent_file_chunks MATCH $1 AND agent_file_chunks.agent_id = $2
             ORDER BY bm25(agent_file_chunks) LIMIT $3`,
            [match, agentId, limit]);
        return rows;
    }
}
