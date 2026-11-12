import { BaseApi } from "@/shared/api/base_fetch";
import type { Session } from "@/shared/types";

export type TokenCounts = {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  requests: number;
  total_tokens: number;
};

export type UsageSummary = {
  days: number;
  totals: TokenCounts;
  estimated_cost_usd: number;
  cost_is_partial: boolean; // some models had no known price
  byDay: (TokenCounts & { day: string })[];
  byModel: (TokenCounts & { provider: string | null; model: string | null; byok?: boolean; cost_usd: number | null })[];
  bySource: (TokenCounts & { source: "chat" | "agent" | "whatsapp" | "telegram" | "pipeline" | "agent_builder" })[];
  topChats: (TokenCounts & { session_id: string; title: string | null })[];
};

export type SearchResult = {
  session_id: string;
  title: string | null;
  source: string | null;
  agent_icon: string | null;
  agent_name: string | null;
  updated_at: string;
  title_match: boolean;
  match_count: number;
  snippets: { role: string; text: string; created_at: string }[];
};

// Client for /api/usage and /api/search (backend routes/insights_routes.ts).
class InsightsApi extends BaseApi {
  constructor() {
    super(import.meta.env.VITE_API_URL);
  }

  usageSummary(days: number) { return this.get<UsageSummary>("/usage/summary", { days }); }
  // Ranked matches, a page at a time; nextOffset is null on the last page.
  searchChats(q: string, offset = 0) {
    return this.get<{ results: SearchResult[]; nextOffset: number | null }>("/search", { q, offset });
  }
  // Every chat, newest activity first, a page at a time (infinite scroll).
  listSessions(cursor?: string | null) {
    return this.get<{ sessions: Session[]; nextCursor: string | null }>("/sessions", cursor ? { cursor } : {});
  }
}

export const insightsApi = new InsightsApi();

// 950 → "950", 12_400 → "12.4k", 3_200_000 → "3.2M"
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}
