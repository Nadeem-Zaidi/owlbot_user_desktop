import { BaseApi } from "@/shared/api/base_fetch";

// Client for /api/market (backend routes/market_routes.ts).

export type Price = { input: number; output: number; cacheRead: number | null; request: number; image: number | null };

export type MarketModel = {
  id: string;
  name: string;
  author: string;
  description: string;
  created: number | null;
  contextLength: number | null;
  maxOutput: number | null;
  inputModalities: string[];
  outputModalities: string[];
  tools: boolean;
  reasoning: boolean;
  structuredOutput: boolean;
  free: boolean;
  huggingFaceId: string | null;
  price: Price; // USD per 1M tokens (request: per request)
  source?: "own" | "openrouter";
  featured?: boolean;
  indiaHosted?: boolean;
};

// ── owner: own catalogue (providers, models, offers) ──
export type ProviderKind = "openai_compatible" | "anthropic" | "openrouter";
export type ProviderHealth = { requests24h: number; uptime24h: number | null; avgLatencyMs: number | null; status: "up" | "degraded" | "down" };
export type AdminProvider = {
  id: string; name: string; kind: ProviderKind; baseUrl: string; keyHint: string; region: string | null; priority: number; enabled: boolean; notes: string | null;
  health?: ProviderHealth | null; budgetUsd: number | null; lastSyncedAt: string | null; syncError: string | null;
};
export type DiscoverItem = {
  providerId: string; providerName: string; upstreamModel: string; inputPerM: number | null; outputPerM: number | null;
  contextLength: number | null; suggestedModelId: string; existingModel: boolean; firstSeen: string;
};
export type HfInfo = { huggingFaceId: string; description: string; license: string | null; contextLength: number | null; parameters: number | null; vision: boolean };
export type AdminOffer = {
  id: string; modelId: string; providerId: string; upstreamModel: string; inputPerM: number; outputPerM: number; cacheReadPerM: number | null;
  requestPrice: number; markupPct: number | null; contextLength: number | null; maxOutput: number | null; quantization: string | null; priority: number; enabled: boolean;
  missingUpstream?: boolean;
};
export type AdminModel = {
  id: string; name: string; author: string; description: string; contextLength: number | null; maxOutput: number | null; inputModalities: string[];
  tools: boolean; reasoning: boolean; structuredOutput: boolean; released: string | null; huggingFaceId: string | null;
  featured: boolean; indiaHosted: boolean; enabled: boolean; offers: AdminOffer[];
};
export type ProviderPreset = { id: string; name: string; kind: ProviderKind; baseUrl: string; keysUrl: string };
export type AdminCatalog = { providers: AdminProvider[]; models: AdminModel[]; presets: ProviderPreset[]; openrouterFallback: boolean; openrouterConfigured: boolean; discoverCount?: number };

export type MarketEndpoint = {
  provider: string;
  tag: string | null;
  quantization: string | null;
  contextLength: number | null;
  maxOutput: number | null;
  price: Price;
  tools: boolean;
  uptime1d: number | null;
  latencyMs?: number | null;
  status: "up" | "degraded" | "down";
};

export type MarketConfig = {
  enabled: boolean;
  paymentsEnabled: boolean;
  purchaseFeePct: number;
  usageMarkupPct: number;
  usdInr: number;
  minTopupUsd: number;
  maxTopupUsd: number;
  apiRequestsPerMinute: number;
  isOwner: boolean;
};

export type LedgerEntry = {
  id: string;
  kind: "purchase" | "usage" | "refund" | "adjustment";
  amountUsd: number;
  balanceAfterUsd: number;
  paidInr?: number;
  feeInr?: number;
  model: string | null;
  source: string | null;
  apiKeyId: string | null;
  inputTokens: number;
  outputTokens: number;
  note: string | null;
  createdAt: string;
};

export type Wallet = {
  balanceUsd: number;
  ledger: LedgerEntry[];
  usage30d: { model: string; requests: number; spentUsd: number; inputTokens: number; outputTokens: number }[];
};

export type TopupStart = { orderId: string; keyId: string; amountPaise: number; feePaise: number; creditsUsd: number; usdInr: number };

export type DevKey = { id: string; name: string; hint: string; limitUsd: number | null; usageUsd: number; disabled: boolean; createdAt: string; lastUsedAt: string | null };

export type Earnings = {
  days: number;
  usdInr: number;
  purchaseFeePct: number;
  usageMarkupPct: number;
  totals: {
    revenueInr: number; purchases: number; creditsSoldUsd: number; feesInr: number; usageChargedUsd: number;
    upstreamCostUsd: number; markupUsd: number; earningsInr: number; requests: number; activeUsers: number;
  };
  allTime: { revenueInr: number; feesInr: number; markupUsd: number };
  liability: { usd: number; wallets: number };
  openrouter: { totalUsd: number; usedUsd: number; remainingUsd: number; coversLiability: boolean } | null;
  daily: { day: string; feesInr: number; revenueInr: number; markupUsd: number; usageChargedUsd: number; upstreamUsd: number }[];
  topModels: { model: string; requests: number; chargedUsd: number; upstreamUsd: number }[];
  topUsers: { userId: string; paidInr: number; usageUsd: number; requests: number }[];
  byProvider?: { provider: string; requests: number; chargedUsd: number; costUsd: number; marginUsd: number; budgetUsd: number | null; spent30Usd: number; budgetUsedPct: number | null }[];
};

class MarketApi extends BaseApi {
  constructor() {
    super(import.meta.env.VITE_API_URL);
  }
  config() { return this.get<MarketConfig>("/market/config"); }
  models() { return this.get<{ models: MarketModel[]; favorites: string[] }>("/market/models"); }
  model(id: string) { return this.get<{ model: MarketModel; endpoints: MarketEndpoint[] }>("/market/model", { id }); }
  addFavorite(model: string) { return this.put<{ favorites: string[] }>("/market/favorites", { model }); }
  removeFavorite(model: string) { return this.delete<{ favorites: string[] }>("/market/favorites", { model }); }
  wallet() { return this.get<Wallet>("/market/wallet"); }
  ledger(before?: string) { return this.get<{ entries: LedgerEntry[] }>("/market/ledger", before ? { before } : undefined); }
  topup(usd: number) { return this.post<TopupStart>("/market/topup", { usd }); }
  verifyTopup(body: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) { return this.post<Wallet>("/market/topup/verify", body); }
  keys() { return this.get<{ keys: DevKey[] }>("/market/keys"); }
  createKey(body: { name: string; limitUsd?: number | null }) { return this.post<DevKey & { key: string }>("/market/keys", body); }
  updateKey(id: string, body: Partial<{ name: string; disabled: boolean; limitUsd: number | null }>) { return this.put<DevKey>(`/market/keys/${encodeURIComponent(id)}`, body); }
  deleteKey(id: string) { return this.delete<void>(`/market/keys/${encodeURIComponent(id)}`); }
  earnings(days: number) { return this.get<Earnings>("/market/admin/earnings", { days }); }
  adjust(userId: string, usd: number, note: string) { return this.post<{ userId: string; balanceUsd: number }>("/market/admin/adjust", { userId, usd, note }); }
  adminCatalog() { return this.get<AdminCatalog>("/market/admin/catalog"); }
  saveProvider(id: string | null, body: Record<string, unknown>) {
    return id ? this.put<AdminProvider>(`/market/admin/providers/${encodeURIComponent(id)}`, body) : this.post<AdminProvider>("/market/admin/providers", body);
  }
  deleteProvider(id: string) { return this.delete<void>(`/market/admin/providers/${encodeURIComponent(id)}`); }
  testProvider(id: string) { return this.post<{ ok: true; models: string[] }>(`/market/admin/providers/${encodeURIComponent(id)}/test`, {}); }
  prefill(id: string) { return this.get<{ model: MarketModel | null }>("/market/admin/prefill", { id }); }
  saveModel(body: Record<string, unknown>, isNew: boolean) {
    return isNew ? this.post<Omit<AdminModel, "offers">>("/market/admin/models", body) : this.put<Omit<AdminModel, "offers">>("/market/admin/models", body);
  }
  deleteModel(id: string) { return this.delete<void>("/market/admin/models", { id }); }
  saveOffer(id: string | null, body: Record<string, unknown>) {
    return id ? this.put<AdminOffer>(`/market/admin/offers/${encodeURIComponent(id)}`, body) : this.post<AdminOffer>("/market/admin/offers", body);
  }
  deleteOffer(id: string) { return this.delete<void>(`/market/admin/offers/${encodeURIComponent(id)}`); }
  discover() { return this.get<{ items: DiscoverItem[] }>("/market/admin/discover"); }
  syncProviders(providerId?: string) { return this.post<{ results: { provider?: string; models?: number; added?: number; fresh?: number; error?: string }[] }>("/market/admin/sync", providerId ? { providerId } : {}); }
  approveDiscovered(body: { providerId: string; upstreamModel: string; modelId: string; inputPerM: number | string; outputPerM: number | string; contextLength?: number | null }) {
    return this.post<{ modelId: string; offer: AdminOffer }>("/market/admin/discover/approve", body);
  }
  ignoreDiscovered(providerId: string, upstreamModel: string) { return this.post<void>("/market/admin/discover/ignore", { providerId, upstreamModel }); }
  ignoreAllDiscovered(providerId: string) { return this.post<{ ignored: number }>("/market/admin/discover/ignore-all", { providerId }); }
  huggingFace(id: string) { return this.get<{ model: HfInfo | null }>("/market/admin/hf", { id }); }
}

export const marketApi = new MarketApi();

// The developer API's base URL (same server as the app's API).
export const apiBaseUrl = () => `${String(import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "")}/v1`;

// Fired after credits are bought, so e.g. the sidebar refreshes the balance.
export const CREDITS_CHANGED = "owlbot:credits-changed";

// Fired after favourites change, so the chat model picker reloads.
export { MODELS_CHANGED } from "@/features/settings/api/settings_api";

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ── formatting ──
export const fmtUsd = (v: number, digits?: number) => {
  if (v === 0) return "$0";
  const abs = Math.abs(v);
  const d = digits ?? (abs >= 100 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6);
  return `${v < 0 ? "-" : ""}$${abs.toLocaleString("en-US", { minimumFractionDigits: Math.min(2, d), maximumFractionDigits: d })}`;
};
export const fmtInr = (v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtPer1M = (v: number) => (v === 0 ? "Free" : `$${v < 0.01 ? v.toFixed(4) : v < 1 ? v.toFixed(3).replace(/0$/, "") : v.toFixed(2)}`);
export const fmtLatency = (ms: number | null | undefined) => (ms === null || ms === undefined ? "—" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
export const fmtTokens = (n: number | null) => {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
};
