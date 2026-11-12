// Provider-hosted agents (Claude Managed Agents, OpenAI Agents) need API keys,
// so the desktop app doesn't have them. The type stays for the workflow engine.
export type NativeAgentRow = { id: string; user_id: string; name: string; icon: string; provider: string; model: string };
