// Knowledge-base search index (vectors from OpenAI, stored in SQLite).
export type SearchHit = { content: string; source_file: string; heading?: string | null; score: number };

export interface IVectorDb {
    search(embedding: number[], query: string, opts: { scope: string; keys?: string[]; limit?: number }): Promise<SearchHit[]>;
}
