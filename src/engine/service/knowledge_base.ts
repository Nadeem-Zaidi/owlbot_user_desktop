// The user's documents. Indexing and search arrive with the knowledge-base
// step of the desktop app; until then it is empty, and agents simply have no
// documents to list or read.
export type KbDocument = { key: string; name: string; size?: number; indexed?: boolean };

export class KnowledgeBase {
    async listDocuments(_scope: string): Promise<KbDocument[]> {
        return [];
    }

    async readDocument(_scope: string, _key: string): Promise<{ name: string; content: string; truncated?: boolean } | null> {
        return null;
    }
}
