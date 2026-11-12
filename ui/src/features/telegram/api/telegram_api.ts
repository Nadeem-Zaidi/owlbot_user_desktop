import { BaseApi } from "@/shared/api/base_fetch";

export type TelegramStatus = {
  enabled: boolean;
  botUsername: string | null;
  botState?: string;
  link: { displayName: string | null; linkedAt: string } | null;
};

export type TelegramLinkCode = { code: string; expiresAt: string; botUsername: string; deepLink: string };

// Client for /api/telegram (backend routes/telegram_routes.ts).
class TelegramApi extends BaseApi {
  constructor() {
    super(import.meta.env.VITE_API_URL);
  }
  status() { return this.get<TelegramStatus>("/telegram/status"); }
  linkCode(sessionId?: string | null) { return this.post<TelegramLinkCode>("/telegram/link_code", sessionId ? { sessionId } : {}); }
  continueChat(sessionId: string) { return this.post<{ ok: true }>("/telegram/continue", { sessionId }); }
  unlink() { return this.delete<{ unlinked: boolean }>("/telegram/link"); }
}

export const telegramApi = new TelegramApi();
