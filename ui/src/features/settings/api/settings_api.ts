import { BaseApi } from "@/shared/api/base_fetch";

export type LLMKeyKind = "openai" | "anthropic" | "openai_compatible";

// A saved key as the server describes it — the key itself never comes back,
// only `keyHint` (its last characters).
export type LLMKey = {
  id: string;
  providerId: string;          // "key:<id>" — what the model picker uses
  kind: LLMKeyKind;
  kindLabel: string;
  label: string;
  baseUrl: string | null;
  keyHint: string;
  models: string[];
  defaultModel: string | null;
  enabled: boolean;
  lastVerifiedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LLMKeyInput = {
  kind: LLMKeyKind;
  label: string;
  baseUrl?: string | null;
  apiKey?: string;             // omit on edit to keep the saved key
  models: string[];
  defaultModel?: string | null;
  enabled?: boolean;
};

// Long-term memory (backend core/memory). "review" = the assistant's saves
// wait as suggestions until approved here.
export type MemoryMode = "auto" | "review" | "off";
export type Memory = {
  id: string;
  content: string;
  status: "active" | "proposed";
  source: "chat" | "user";
  session_id: string | null;
  created_at: string;
  updated_at: string;
};
export type MemoryOverview = { mode: MemoryMode; limit: number; maxChars: number; memories: Memory[] };

export type WhatsAppSettings = { enabled: boolean; selfChat: boolean; adminEmails: string[] };
export type WhatsAppSettingsView = {
  settings: WhatsAppSettings;
  updatedAt: string | null;
  updatedBy: string | null;
  runtime: { hostedHere: boolean; running: boolean; state: string; botNumber?: string };
};

// Telegram bot (owner). The token is write-only: only `tokenHint` comes back.
export type TelegramSettingsView = {
  settings: { enabled: boolean; hasToken: boolean; tokenHint: string | null; botUsername: string | null; updatedAt: string | null; updatedBy: string | null };
  runtime: { hostedHere: boolean; running: boolean; state: string };
};

// Services that speak OpenAI's Chat Completions API. Users can also type any other base URL.
export const COMPATIBLE_PRESETS: { id: string; label: string; baseUrl: string; keyUrl?: string }[] = [
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", keyUrl: "https://openrouter.ai/keys" },
  { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", keyUrl: "https://console.groq.com/keys" },
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", keyUrl: "https://platform.deepseek.com/api_keys" },
  { id: "gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", keyUrl: "https://aistudio.google.com/apikey" },
  { id: "mistral", label: "Mistral", baseUrl: "https://api.mistral.ai/v1", keyUrl: "https://console.mistral.ai/api-keys" },
  { id: "together", label: "Together AI", baseUrl: "https://api.together.xyz/v1", keyUrl: "https://api.together.ai/settings/api-keys" },
  { id: "fireworks", label: "Fireworks", baseUrl: "https://api.fireworks.ai/inference/v1", keyUrl: "https://fireworks.ai/account/api-keys" },
  { id: "xai", label: "xAI (Grok)", baseUrl: "https://api.x.ai/v1", keyUrl: "https://console.x.ai" },
  { id: "custom", label: "Other (custom URL)", baseUrl: "" },
];

export const KEY_LINKS: Record<"openai" | "anthropic", string> = {
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
};

// Client for /api/llm-keys and /api/admin (backend routes/llm_key_routes.ts, routes/admin_routes.ts).
class SettingsApi extends BaseApi {
  constructor() {
    super(import.meta.env.VITE_API_URL);
  }
  listKeys() { return this.get<{ keys: LLMKey[] }>("/llm-keys"); }
  testKey(body: Partial<LLMKeyInput> & { id?: string }) { return this.post<{ ok: true; models: string[] }>("/llm-keys/test", body); }
  createKey(body: LLMKeyInput) { return this.post<LLMKey>("/llm-keys", body); }
  updateKey(id: string, body: Partial<LLMKeyInput>) { return this.put<LLMKey>(`/llm-keys/${encodeURIComponent(id)}`, body); }
  deleteKey(id: string) { return this.delete<void>(`/llm-keys/${encodeURIComponent(id)}`); }

  memory() { return this.get<MemoryOverview>("/memory"); }
  setMemoryMode(mode: MemoryMode) { return this.put<{ mode: MemoryMode }>("/memory/settings", { mode }); }
  addMemory(content: string) { return this.post<Memory>("/memory", { content }); }
  editMemory(id: string, body: { content?: string; status?: "active" }) { return this.put<Memory>(`/memory/${encodeURIComponent(id)}`, body); }
  deleteMemory(id: string) { return this.delete<void>(`/memory/${encodeURIComponent(id)}`); }
  clearMemory() { return this.delete<{ deleted: number }>("/memory"); }

  me() { return this.get<{ isOwner: boolean; ownersConfigured: boolean }>("/admin/me"); }
  whatsappSettings() { return this.get<WhatsAppSettingsView>("/admin/settings/whatsapp"); }
  saveWhatsappSettings(body: Partial<WhatsAppSettings>) { return this.put<WhatsAppSettingsView>("/admin/settings/whatsapp", body); }
  telegramSettings() { return this.get<TelegramSettingsView>("/admin/settings/telegram"); }
  saveTelegramSettings(body: { enabled?: boolean; botToken?: string | null }) { return this.put<TelegramSettingsView>("/admin/settings/telegram", body); }
}

export const settingsApi = new SettingsApi();

// Fired on window after keys change, so the chat's model picker reloads.
export const MODELS_CHANGED = "owlbot:models-changed";
