// Charts the assistant shows with the show_chart tool (backend tools/chart_tools.ts).
// The spec is the tool's result, so it comes back with the chat history too.

export const CHART_TOOL = "show_chart";

export type ChartType = "bar" | "line" | "area" | "pie" | "donut";
export type ChartSpec = {
  type: ChartType;
  title: string;
  subtitle?: string;
  categories: string[];
  series: { name: string; values: (number | null)[] }[];
  stacked?: boolean;
  horizontal?: boolean;
  format: "number" | "currency" | "percent";
  currency?: string;
  x_label?: string;
  y_label?: string;
};

// Categorical palette, fixed order (colour-blind-safe adjacent pairs). A
// series keeps its colour by position even when others are hidden.
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
// Pie/donut slices past the palette fold into neutral greys.
export const sliceColor = (i: number) => SERIES_COLORS[i] ?? ["#8b8b95", "#a8a8b1", "#c4c4cb", "#6f6f79"][(i - SERIES_COLORS.length) % 4];

type Json = Record<string, unknown>;
const parse = (raw: unknown): Json | null => {
  if (raw && typeof raw === "object") return raw as Json;
  if (typeof raw !== "string") return null;
  try { return JSON.parse(raw); } catch { return null; }
};

export function chartFrom(output: unknown): ChartSpec | null {
  const c = parse(output)?.chart as ChartSpec | undefined;
  if (!c || !Array.isArray(c.categories) || !Array.isArray(c.series) || !c.series.length) return null;
  if (c.series.some((s) => !Array.isArray(s?.values))) return null;
  return c;
}

type StoredMessage = { role?: string; tool_call_id?: string; name?: string; output?: unknown };

// Charts drawn in the turn that ends with this assistant message (after a reload).
export function chartsForAssistantMessage(messages: StoredMessage[], assistantIndex: number): ChartSpec[] {
  let start = 0;
  for (let i = assistantIndex - 1; i >= 0; i--) {
    if (messages[i].role === "user") { start = i + 1; break; }
  }
  const names: Record<string, string> = {};
  const charts: ChartSpec[] = [];
  for (let i = start; i < assistantIndex; i++) {
    const m = messages[i];
    if (m.role === "tool_call" && m.tool_call_id && m.name) names[m.tool_call_id] = m.name;
    if (m.role === "tool_call_output" && m.tool_call_id && names[m.tool_call_id] === CHART_TOOL) {
      const c = chartFrom(m.output);
      if (c) charts.push(c);
    }
  }
  return charts;
}

// ── number formatting ──
const locale = (spec: ChartSpec) => (spec.currency === "₹" || (!spec.currency && spec.format === "currency") ? "en-IN" : "en-US");

export function formatValue(v: number | null | undefined, spec: ChartSpec): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const n = v.toLocaleString(locale(spec), { maximumFractionDigits: 2 });
  if (spec.format === "currency") return v < 0 ? `-${spec.currency ?? "₹"}${n.slice(1)}` : `${spec.currency ?? "₹"}${n}`;
  if (spec.format === "percent") return `${n}%`;
  return n;
}

export function formatTick(v: number, spec: ChartSpec): string {
  const n = Math.abs(v) >= 1000
    ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v)
    : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (spec.format === "currency") return v < 0 ? `-${spec.currency ?? "₹"}${n.slice(1)}` : `${spec.currency ?? "₹"}${n}`;
  if (spec.format === "percent") return `${n}%`;
  return n;
}

// "Nice" axis ticks (1, 2, 2.5, 5 × 10^n) covering [min, max].
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) { max = min === 0 ? 1 : min + Math.abs(min); }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t / step) * step);
  return ticks;
}

export function toCsv(spec: ChartSpec): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const head = ["", ...spec.series.map((s) => s.name)].map(esc).join(",");
  const rows = spec.categories.map((c, i) => [esc(c), ...spec.series.map((s) => (s.values[i] ?? "").toString())].join(","));
  return [head, ...rows].join("\n");
}
