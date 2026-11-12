import { NativeAgentRow } from "../../repository/native_agent_repository";

// Not available in the desktop app (see native_agent_repository.ts).
export interface NativeAgentService {
    get(userId: string, id: string): Promise<NativeAgentRow>;
    requireActive(userId: string, agent: NativeAgentRow): Promise<void>;
    runOnce(agent: NativeAgentRow, userId: string, sessionId: string, prompt: string, signal: AbortSignal): Promise<{ text: string; error: string | null }>;
}
