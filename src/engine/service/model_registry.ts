import { ILLM } from "../interfaces/illm";

// The server edition's registry of providers and users' own API keys. The
// desktop app has one provider (Claude Code), wired directly in app.ts.
export interface ModelRegistry {
    listFor(userId: string): Promise<{ providers: { id: string; label: string; byok: boolean; defaultModel: string; models: { id: string; label: string }[] }[]; defaultProvider: string }>;
    validateChoice(userId: string, provider: string, model: string | null): Promise<void>;
    resolve(userId: string, provider?: string | null, model?: string | null, strict?: boolean): Promise<{ llm: ILLM; model: string }>;
}
