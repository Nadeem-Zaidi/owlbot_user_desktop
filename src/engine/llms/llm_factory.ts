// The desktop app has one model provider: Claude Code, signed in with the
// user's own Claude account (llms/claude_code_provider.ts).
export type LLMProvider = "claude";

export const PROVIDER_LABELS: Record<string, string> = { claude: "Claude" };
