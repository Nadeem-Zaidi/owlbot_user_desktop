import { auth } from "@/shared/lib/firebase";
import { SERVER_FEATURES } from "@/shared/lib/features";

// Live events from the server over one WebSocket per tab (backend
// gateway/live_socket.ts): e.g. a WhatsApp, Telegram or scheduled turn just
// finished, so the sidebar can refresh at once instead of on the next focus.
//
// Protocol: send {"type":"auth","token"} first; then {"type":"event",…}
// frames arrive. Reconnects with backoff; a rejected token is refreshed once.

export type LiveEvent =
  | { event: "run.started"; data: { sessionId: string; runId: string; channel: string } }
  | { event: "run.finished"; data: { sessionId: string; runId: string; channel: string; status: string } };

type Listener = (e: LiveEvent) => void;

const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let forceRefresh = false;

function eventsUrl(): string {
  const api = String(import.meta.env.VITE_API_URL ?? "/api").replace(/\/+$/, "");
  if (/^https?:\/\//.test(api)) return `${api.replace(/^http/, "ws")}/events`;
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${api}/events`;
}

function connect() {
  // The desktop engine sends no live events (there are no other devices).
  if (!SERVER_FEATURES || socket || !listeners.size || !auth.currentUser) return;
  let ws: WebSocket;
  try {
    ws = new WebSocket(eventsUrl());
  } catch {
    return schedule();
  }
  socket = ws;
  ws.onopen = async () => {
    try {
      const token = await auth.currentUser?.getIdToken(forceRefresh);
      forceRefresh = false;
      if (!token) return ws.close();
      ws.send(JSON.stringify({ type: "auth", token }));
    } catch {
      ws.close();
    }
  };
  ws.onmessage = (m) => {
    let frame: { type?: string; event?: string; data?: unknown };
    try { frame = JSON.parse(String(m.data)); } catch { return; }
    if (frame.type === "ready") retry = 0;
    if (frame.type === "event" && frame.event) {
      for (const fn of listeners) fn({ event: frame.event, data: frame.data } as LiveEvent);
    }
  };
  ws.onclose = (e) => {
    if (socket === ws) socket = null;
    if (e.code === 4401) forceRefresh = true; // token expired: get a fresh one
    schedule();
  };
  ws.onerror = () => { /* onclose follows */ };
}

function schedule() {
  if (retryTimer || !listeners.size) return;
  const delay = Math.min(30_000, 1_000 * 2 ** retry) * (0.75 + Math.random() * 0.5);
  retry = Math.min(retry + 1, 6);
  retryTimer = setTimeout(() => { retryTimer = null; connect(); }, delay);
}

// Subscribe; the socket opens with the first listener and closes with the last.
export function onLiveEvent(fn: Listener): () => void {
  listeners.add(fn);
  connect();
  return () => {
    listeners.delete(fn);
    if (!listeners.size) {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      const s = socket;
      socket = null;
      s?.close(1000, "no listeners");
    }
  };
}
