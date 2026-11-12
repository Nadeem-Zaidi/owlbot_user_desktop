import { BaseApi } from "@/shared/api/base_fetch";

// ── Reminders, to-dos, web watchers (backend core/automations) ──
export type Repeat = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly";

export type Task = {
  id: string;
  title: string;
  notes: string;
  status: "open" | "done" | "cancelled";
  repeat: Repeat;
  timezone: string;
  remind_at: string | null;
  remind_local: string | null;      // "2026-10-20T09:00" in the task's timezone
  last_reminded_at: string | null;
  source: string;
  created_at: string;
  completed_at: string | null;
};
export type TaskInput = { title: string; notes?: string; remind_at?: string; repeat?: Repeat; timezone?: string };

export type Watcher = {
  id: string;
  name: string;
  url: string;
  mode: "change" | "ai";
  condition: string;
  interval_minutes: number;
  status: "active" | "paused";
  next_check_at: string | null;
  last_checked_at: string | null;
  last_match: boolean | null;
  last_result: string | null;
  last_alert_at: string | null;
  last_error: string | null;
  fail_count: number;
  created_at: string;
};
export type WatcherInput = { name?: string; url: string; mode: "change" | "ai"; condition?: string; interval_minutes: number };

export type Alert = { id: number; kind: "reminder" | "watcher"; ref_id: string | null; title: string; body: string; delivered_via: string; read_at: string | null; created_at: string };
export type AutomationSettings = { timezone: string; saved: boolean; now_local: string };

// Client for /api/automations (backend routes/automation_routes.ts).
class AutomationsApi extends BaseApi {
  constructor() {
    super(import.meta.env.VITE_API_URL);
  }

  settings() { return this.get<AutomationSettings>("/automations/settings"); }
  setTimezone(timezone: string) { return this.put<AutomationSettings>("/automations/settings", { timezone }); }

  async tasks(all = false) { return (await this.get<{ tasks: Task[] }>(`/automations/tasks${all ? "?status=all" : ""}`)).tasks; }
  createTask(input: TaskInput) { return this.post<Task>("/automations/tasks", input); }
  updateTask(id: string, input: TaskInput) { return this.put<Task>(`/automations/tasks/${id}`, input); }
  setTaskStatus(id: string, status: Task["status"]) { return this.post<Task>(`/automations/tasks/${id}/status`, { status }); }
  deleteTask(id: string) { return this.delete<void>(`/automations/tasks/${id}`); }

  async watchers() { return (await this.get<{ watchers: Watcher[] }>("/automations/watchers")).watchers; }
  createWatcher(input: WatcherInput) { return this.post<Watcher>("/automations/watchers", input); }
  updateWatcher(id: string, input: WatcherInput) { return this.put<Watcher>(`/automations/watchers/${id}`, input); }
  setWatcherStatus(id: string, status: Watcher["status"]) { return this.post<Watcher>(`/automations/watchers/${id}/status`, { status }); }
  checkWatcher(id: string) { return this.post<Watcher>(`/automations/watchers/${id}/check`, {}); }
  deleteWatcher(id: string) { return this.delete<void>(`/automations/watchers/${id}`); }

  alerts() { return this.get<{ alerts: Alert[]; unread: number }>("/automations/alerts"); }
  async unread() { return (await this.get<{ unread: number }>("/automations/alerts/unread")).unread; }
  markRead() { return this.post<void>("/automations/alerts/read", {}); }
}

export const automationsApi = new AutomationsApi();

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: "Once", daily: "Every day", weekdays: "Every weekday", weekly: "Every week", monthly: "Every month", yearly: "Every year",
};

// "2026-10-20T09:00" → "Tue 20 Oct, 09:00" (the time as the user set it).
export function prettyLocal(local: string): string {
  const [d, t] = local.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, day));
  const label = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${label}${y !== new Date().getFullYear() ? ` ${y}` : ""}, ${t}`;
}

export function ago(iso: string | null): string {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

export const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
};
