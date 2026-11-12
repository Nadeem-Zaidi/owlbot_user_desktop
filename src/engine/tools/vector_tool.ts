import { IVectorDb } from "../interfaces/vectordb/ivector";
import { ToolContext, ToolDefinition } from "../types/type";

export interface EmbeddingProvider {
    // False until an OpenAI key is saved in Settings.
    readonly ready: boolean;
    embed(texts: string[]): Promise<number[][]>;
}

// search_knowledge_base: passages from the user's indexed documents
// (optionally only `documentKeys`, for an agent limited to some documents).
export function createVectorSearchTool(vectorDb: IVectorDb, embed: EmbeddingProvider, documentKeys: string[] = []): ToolDefinition {
    return {
        name: "search_knowledge_base",
        description: "Searches the user's knowledge base (their indexed documents) and returns the most relevant passages with their source file.",
        parameters: {
            type: "object",
            properties: { query: { type: "string", description: "What to look for, in natural language" } },
            required: ["query"],
        },
        execute: async (args: Record<string, any>, ctx: ToolContext) => {
            const query = String(args.query ?? "").trim();
            if (!query) throw new Error("Give a search query");
            if (!embed.ready) throw new Error("The knowledge base isn't set up yet: add an OpenAI key in Settings to index and search documents.");
            const [vector] = await embed.embed([query]);
            const hits = await vectorDb.search(vector, query, { scope: ctx.kbScope ?? ctx.userId ?? "", keys: documentKeys, limit: 8 });
            if (!hits.length) return "No matching passages in the knowledge base.";
            return hits.map((h) => ({ source_file: h.source_file.split("/").pop(), heading: h.heading ?? undefined, content: h.content }));
        },
    };
}
