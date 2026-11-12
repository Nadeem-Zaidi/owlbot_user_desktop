import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ChartArea, ChartColumn, ChartLine, ChartPie, FileDown, LoaderCircle, Table2 } from "lucide-react";
import { formatTick, formatValue, niceTicks, SERIES_COLORS, sliceColor, toCsv, type ChartSpec } from "@/features/charts/lib/chart_spec";

const TYPE_ICON = { bar: ChartColumn, line: ChartLine, area: ChartArea, pie: ChartPie, donut: ChartPie } as const;
// Axis labels are 11.5px in the app font; measure them so labels are only
// thinned out or shortened when they'd really collide.
let measureCtx: CanvasRenderingContext2D | null | undefined;
function textWidth(s: string): number {
  if (measureCtx === undefined) {
    measureCtx = document.createElement("canvas").getContext("2d");
    if (measureCtx) measureCtx.font = `11.5px ${getComputedStyle(document.body).getPropertyValue("--font") || "Inter, system-ui, sans-serif"}`;
  }
  return measureCtx ? measureCtx.measureText(s).width : s.length * 6.6;
}
const widest = (labels: string[]) => Math.max(0, ...labels.map(textWidth));
// Shortens a label to fit `px`, with an ellipsis.
function fitLabel(s: string, px: number): string {
  if (textWidth(s) <= px) return s;
  let lo = 1, hi = s.length;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (textWidth(`${s.slice(0, mid)}…`) <= px) lo = mid; else hi = mid - 1; }
  return `${s.slice(0, lo)}…`;
}

// Keeps the chart's width in step with its container.
function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

const ellipsis = (s: string, max: number) => (s.length > max ? `${s.slice(0, Math.max(max - 1, 1))}…` : s);

// A bar with its data end rounded (4px) and the baseline end square.
function barPath(x0: number, y0: number, x1: number, y1: number, end: "top" | "bottom" | "right" | "left" | "none"): string {
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return "";
  const r = Math.min(4, end === "top" || end === "bottom" ? w / 2 : h / 2, end === "top" || end === "bottom" ? h : w);
  switch (end) {
    case "top": return `M${x0},${y1}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x1 - r}Q${x1},${y0} ${x1},${y0 + r}V${y1}Z`;
    case "bottom": return `M${x0},${y0}H${x1}V${y1 - r}Q${x1},${y1} ${x1 - r},${y1}H${x0 + r}Q${x0},${y1} ${x0},${y1 - r}Z`;
    case "right": return `M${x0},${y0}H${x1 - r}Q${x1},${y0} ${x1},${y0 + r}V${y1 - r}Q${x1},${y1} ${x1 - r},${y1}H${x0}Z`;
    case "left": return `M${x1},${y0}V${y1}H${x0 + r}Q${x0},${y1} ${x0},${y1 - r}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}Z`;
    default: return `M${x0},${y0}H${x1}V${y1}H${x0}Z`;
  }
}

type Tip = { x: number; y: number; title: string; rows: { color: string; name: string; value: string }[]; total?: string };

// The assistant's chart, inline in the chat: chart ⇄ table, hover values,
// legend toggles, CSV download.
export const ChartCard = ({ spec }: { spec: ChartSpec }) => {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const round = spec.type === "pie" || spec.type === "donut";
  const Icon = TYPE_ICON[spec.type] ?? ChartColumn;

  const toggle = (i: number) => setHidden((h) => {
    const next = new Set(h);
    if (next.has(i)) next.delete(i);
    else if (next.size < (round ? spec.categories.length : spec.series.length) - 1) next.add(i);   // keep one visible
    return next;
  });

  const downloadCsv = () => {
    const url = URL.createObjectURL(new Blob(["﻿" + toCsv(spec)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${spec.title.replace(/[\\/:*?"<>|]+/g, "").slice(0, 80) || "chart"}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const legend = round
    ? spec.categories.map((c, i) => ({ name: c, color: sliceColor(i) }))
    : spec.series.map((s, i) => ({ name: s.name, color: SERIES_COLORS[i] }));

  return (
    <figure className="ch_card">
      <header className="ch_card__head">
        <span className="ch_card__icon" aria-hidden="true"><Icon size={16} /></span>
        <div className="ch_card__titles">
          <figcaption className="ch_card__title">{spec.title}</figcaption>
          {spec.subtitle && <p className="ch_card__subtitle">{spec.subtitle}</p>}
        </div>
        <div className="ch_card__actions">
          <div className="ch_seg" role="tablist" aria-label="View">
            <button type="button" role="tab" aria-selected={view === "chart"} className={view === "chart" ? "is_on" : ""} onClick={() => setView("chart")} title="Chart"><Icon size={15} /></button>
            <button type="button" role="tab" aria-selected={view === "table"} className={view === "table" ? "is_on" : ""} onClick={() => setView("table")} title="Table"><Table2 size={15} /></button>
          </div>
          <button type="button" className="ch_icon_btn" onClick={downloadCsv} title="Download CSV" aria-label="Download CSV"><FileDown size={15} /></button>
        </div>
      </header>

      {view === "table" ? (
        <ChartTable spec={spec} />
      ) : (
        <>
          {round ? <RoundChart spec={spec} hidden={hidden} onToggle={toggle} /> : spec.horizontal ? <HBarChart spec={spec} hidden={hidden} /> : <XYChart spec={spec} hidden={hidden} />}
          {!round && legend.length > 1 && (
            <ul className="ch_legend">
              {legend.map((l, i) => (
                <li key={i}>
                  <button type="button" className={hidden.has(i) ? "is_off" : ""} onClick={() => toggle(i)} aria-pressed={!hidden.has(i)} title={hidden.has(i) ? "Show" : "Hide"}>
                    <span className="ch_swatch" style={{ background: l.color }} />{l.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </figure>
  );
};

export const ChartSkeleton = () => (
  <div className="ch_card ch_card--pending" aria-busy="true">
    <div className="ch_card__head">
      <span className="ch_card__icon"><LoaderCircle size={16} className="spin" /></span>
      <div className="ch_card__titles"><span className="ch_card__title">Drawing chart…</span></div>
    </div>
    <div className="ch_skeleton">{[38, 62, 48, 80, 56, 70, 44].map((h, i) => <span key={i} style={{ height: `${h}%` }} />)}</div>
  </div>
);

const TooltipBox = ({ tip, width }: { tip: Tip | null; width: number }) => {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x, 8), Math.max(width - 8, 8));
  return (
    <div className={`ch_tip ${tip.x > width * 0.62 ? "is_left" : ""}`} style={{ left, top: tip.y }} role="status">
      <div className="ch_tip__title">{tip.title}</div>
      {tip.rows.map((r, i) => (
        <div key={i} className="ch_tip__row"><span className="ch_swatch" style={{ background: r.color }} /><span className="ch_tip__name">{r.name}</span><strong>{r.value}</strong></div>
      ))}
      {tip.total && <div className="ch_tip__row ch_tip__total"><span className="ch_tip__name">Total</span><strong>{tip.total}</strong></div>}
    </div>
  );
};

// ── vertical bars, lines, areas ──
const XYChart = ({ spec, hidden }: { spec: ChartSpec; hidden: Set<number> }) => {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = spec.categories.length;
  const visible = spec.series.map((s, i) => ({ ...s, i })).filter((s) => !hidden.has(s.i));
  const stacked = !!spec.stacked && visible.length > 1;

  // Domain (stacked: positive and negative parts stack separately).
  let lo = 0, hi = 0;
  for (let c = 0; c < n; c++) {
    if (stacked) {
      let pos = 0, neg = 0;
      for (const s of visible) { const v = s.values[c] ?? 0; if (v >= 0) pos += v; else neg += v; }
      hi = Math.max(hi, pos); lo = Math.min(lo, neg);
    } else {
      for (const s of visible) { const v = s.values[c]; if (v !== null && v !== undefined) { hi = Math.max(hi, v); lo = Math.min(lo, v); } }
    }
  }
  const ticks = niceTicks(lo, hi);
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const tickLabels = ticks.map((t) => formatTick(t, spec));
  const H = 280;
  const m = { top: 14, right: 14, bottom: spec.x_label ? 46 : 30, left: Math.ceil(widest(tickLabels)) + 14 + (spec.y_label ? 18 : 0) };
  const iw = Math.max(width - m.left - m.right, 10), ih = H - m.top - m.bottom;
  const y = (v: number) => m.top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
  const band = iw / n;
  const cx = (c: number) => m.left + band * c + band / 2;

  // Category labels: thin them out when they'd collide.
  // Thin labels out only when even a shortened (~14 char) label won't fit its band.
  const labelW = Math.min(widest(spec.categories), widest(spec.categories.map((c) => c.slice(0, 14))) + 8);
  const every = Math.max(1, Math.ceil((labelW + 8) / band));
  const labelPx = band * every - 8;

  const tip: Tip | null = hover === null ? null : {
    x: cx(hover),
    y: m.top,
    title: spec.categories[hover],
    rows: visible.map((s) => ({ color: SERIES_COLORS[s.i], name: s.name, value: formatValue(s.values[hover], spec) })),
    total: stacked ? formatValue(visible.reduce((a, s) => a + (s.values[hover] ?? 0), 0), spec) : undefined,
  };

  const marks: ReactNode[] = [];
  if (width > 0 && spec.type === "bar") {
    const groupW = band * (n > 24 ? 0.86 : 0.72);
    const gap = 2;
    const each = stacked ? groupW : (groupW - gap * (visible.length - 1)) / visible.length;
    for (let c = 0; c < n; c++) {
      const x0 = cx(c) - groupW / 2;
      let pos = 0, neg = 0;
      // Which stacked segment is outermost (gets the rounded end).
      const lastPos = stacked ? [...visible].reverse().find((s) => (s.values[c] ?? 0) > 0)?.i : undefined;
      const lastNeg = stacked ? [...visible].reverse().find((s) => (s.values[c] ?? 0) < 0)?.i : undefined;
      visible.forEach((s, k) => {
        const v = s.values[c];
        if (v === null || v === undefined || v === 0) return;
        let base: number, top: number;
        if (stacked) { base = v > 0 ? pos : neg; top = base + v; if (v > 0) pos = top; else neg = top; }
        else { base = 0; top = v; }
        const bx = stacked ? x0 : x0 + k * (each + gap);
        const yA = y(Math.max(base, top)), yB = y(Math.min(base, top));
        const outer = !stacked || (v > 0 ? lastPos === s.i : lastNeg === s.i);
        // 2px surface gap between stacked segments.
        const inset = stacked && base !== 0 ? 1 : 0;
        const d = v > 0 ? barPath(bx, yA, bx + each, yB - inset, outer ? "top" : "none") : barPath(bx, yA + inset, bx + each, yB, outer ? "bottom" : "none");
        marks.push(<path key={`${c}-${s.i}`} d={d} fill={SERIES_COLORS[s.i]} className={`ch_bar ${v < 0 ? "is_neg" : ""} ${hover !== null && hover !== c ? "is_dim" : ""}`} style={{ animationDelay: `${Math.min(c * 25, 400)}ms` }} />);
      });
    }
  } else if (width > 0) {
    // Lines/areas; stacked areas sit on the series below.
    const cum = new Array(n).fill(0);
    const layers = visible.map((s) => {
      const pts = s.values.map((v, c) => {
        if (v === null || v === undefined) return null;
        const base = stacked ? cum[c] : 0;
        const top = base + v;
        if (stacked) cum[c] = top;
        return { x: cx(c), y: y(top), y0: y(base) };
      });
      return { s, pts };
    });
    for (const { s, pts } of [...layers].reverse()) {
      const segments: { x: number; y: number; y0: number }[][] = [];
      let cur: { x: number; y: number; y0: number }[] = [];
      for (const p of pts) { if (p) cur.push(p); else if (cur.length) { segments.push(cur); cur = []; } }
      if (cur.length) segments.push(cur);
      const color = SERIES_COLORS[s.i];
      segments.forEach((seg, k) => {
        const line = seg.map((p, j) => `${j ? "L" : "M"}${p.x},${p.y}`).join("");
        if (spec.type === "area") {
          const area = `${line}${[...seg].reverse().map((p) => `L${p.x},${p.y0}`).join("")}Z`;
          marks.push(<path key={`a${s.i}-${k}`} d={area} fill={color} className="ch_area" />);
        }
        marks.push(<path key={`l${s.i}-${k}`} d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="ch_line" />);
      });
      const showDots = n <= 16;
      pts.forEach((p, c) => {
        if (!p || (!showDots && hover !== c)) return;
        marks.push(<circle key={`d${s.i}-${c}`} cx={p.x} cy={p.y} r={hover === c ? 5 : 4} fill={color} stroke="var(--ch-surface)" strokeWidth={2} className="ch_dot" />);
      });
    }
  }

  return (
    <div ref={ref} className="ch_plot" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={spec.title}>
          {ticks.map((t, k) => (
            <g key={k}>
              <line x1={m.left} x2={m.left + iw} y1={y(t)} y2={y(t)} className={t === 0 ? "ch_zero" : "ch_grid"} />
              <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="ch_tick">{tickLabels[k]}</text>
            </g>
          ))}
          {spec.y_label && <text transform={`translate(12 ${m.top + ih / 2}) rotate(-90)`} textAnchor="middle" className="ch_axis_title">{spec.y_label}</text>}
          {hover !== null && spec.type !== "bar" && <line x1={cx(hover)} x2={cx(hover)} y1={m.top} y2={m.top + ih} className="ch_crosshair" />}
          {hover !== null && spec.type === "bar" && <rect x={m.left + band * hover} y={m.top} width={band} height={ih} className="ch_band" />}
          {marks}
          {spec.categories.map((c, k) => (k % every === 0 ? (
            <text key={k} x={cx(k)} y={m.top + ih + 18} textAnchor="middle" className="ch_tick">{fitLabel(c, labelPx)}</text>
          ) : null))}
          {spec.x_label && <text x={m.left + iw / 2} y={H - 8} textAnchor="middle" className="ch_axis_title">{spec.x_label}</text>}
          {/* Hit targets: one full-height band per category. */}
          {spec.categories.map((_, k) => (
            <rect key={k} x={m.left + band * k} y={m.top} width={band} height={ih} fill="transparent" onMouseEnter={() => setHover(k)} onClick={() => setHover(k)} />
          ))}
        </svg>
      )}
      <TooltipBox tip={tip} width={width} />
    </div>
  );
};

// ── horizontal bars (long labels) ──
const HBarChart = ({ spec, hidden }: { spec: ChartSpec; hidden: Set<number> }) => {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = spec.categories.length;
  const visible = spec.series.map((s, i) => ({ ...s, i })).filter((s) => !hidden.has(s.i));
  const stacked = !!spec.stacked && visible.length > 1;
  let lo = 0, hi = 0;
  for (let c = 0; c < n; c++) {
    if (stacked) {
      let pos = 0, neg = 0;
      for (const s of visible) { const v = s.values[c] ?? 0; if (v >= 0) pos += v; else neg += v; }
      hi = Math.max(hi, pos); lo = Math.min(lo, neg);
    } else for (const s of visible) { const v = s.values[c]; if (v != null) { hi = Math.max(hi, v); lo = Math.min(lo, v); } }
  }
  const ticks = niceTicks(lo, hi, 4);
  const xMin = ticks[0], xMax = ticks[ticks.length - 1];
  const row = Math.max(26, (stacked ? 1 : visible.length) * 12 + 14);
  const m = { top: 8, right: 16, bottom: 26, left: Math.min(Math.max(width * 0.36, 60), widest(spec.categories) + 18) };
  const iw = Math.max(width - m.left - m.right, 10);
  const H = m.top + row * n + m.bottom;
  const x = (v: number) => m.left + ((v - xMin) / (xMax - xMin || 1)) * iw;

  const marks: ReactNode[] = [];
  if (width > 0) {
    for (let c = 0; c < n; c++) {
      const y0 = m.top + row * c + 5, h = row - 10;
      let pos = 0, neg = 0;
      const each = stacked ? h : (h - 2 * (visible.length - 1)) / visible.length;
      const lastPos = stacked ? [...visible].reverse().find((s) => (s.values[c] ?? 0) > 0)?.i : undefined;
      visible.forEach((s, k) => {
        const v = s.values[c];
        if (v == null || v === 0) return;
        let base = 0, top = v;
        if (stacked) { base = v > 0 ? pos : neg; top = base + v; if (v > 0) pos = top; else neg = top; }
        const by = stacked ? y0 : y0 + k * (each + 2);
        const inset = stacked && base !== 0 ? 1 : 0;
        const outer = !stacked || v < 0 || lastPos === s.i;
        const d = v > 0 ? barPath(x(base) + inset, by, x(top), by + each, outer ? "right" : "none") : barPath(x(top), by, x(base) - inset, by + each, "left");
        marks.push(<path key={`${c}-${s.i}`} d={d} fill={SERIES_COLORS[s.i]} className={`ch_bar ch_bar--h ${hover !== null && hover !== c ? "is_dim" : ""}`} style={{ animationDelay: `${Math.min(c * 25, 400)}ms` }} />);
      });
    }
  }
  const tip: Tip | null = hover === null ? null : {
    x: Math.min(x(stacked ? visible.reduce((a, s) => a + Math.max(s.values[hover] ?? 0, 0), 0) : Math.max(...visible.map((s) => s.values[hover] ?? 0))) + 8, width - 8),
    y: m.top + row * hover,
    title: spec.categories[hover],
    rows: visible.map((s) => ({ color: SERIES_COLORS[s.i], name: s.name, value: formatValue(s.values[hover], spec) })),
    total: stacked ? formatValue(visible.reduce((a, s) => a + (s.values[hover] ?? 0), 0), spec) : undefined,
  };

  return (
    <div ref={ref} className="ch_plot" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={spec.title}>
          {ticks.map((t, k) => (
            <g key={k}>
              <line y1={m.top} y2={m.top + row * n} x1={x(t)} x2={x(t)} className={t === 0 ? "ch_zero" : "ch_grid"} />
              <text x={x(t)} y={m.top + row * n + 17} textAnchor="middle" className="ch_tick">{formatTick(t, spec)}</text>
            </g>
          ))}
          {hover !== null && <rect x={m.left} y={m.top + row * hover} width={iw} height={row} className="ch_band" />}
          {spec.categories.map((c, k) => (
            <text key={k} x={m.left - 10} y={m.top + row * k + row / 2} dy="0.32em" textAnchor="end" className="ch_tick ch_tick--cat">{fitLabel(c, m.left - 14)}</text>
          ))}
          {marks}
          {spec.categories.map((_, k) => (
            <rect key={k} x={0} y={m.top + row * k} width={width} height={row} fill="transparent" onMouseEnter={() => setHover(k)} onClick={() => setHover(k)} />
          ))}
        </svg>
      )}
      <TooltipBox tip={tip} width={width} />
    </div>
  );
};

// ── pie / donut ──
const RoundChart = ({ spec, hidden, onToggle }: { spec: ChartSpec; hidden: Set<number>; onToggle: (i: number) => void }) => {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const values = spec.series[0].values.map((v, i) => (hidden.has(i) ? 0 : Math.max(v ?? 0, 0)));
  const total = values.reduce((a, v) => a + v, 0) || 1;
  const size = Math.min(Math.max(width, 0), 260);
  const R = size / 2 - 6, inner = spec.type === "donut" ? R * 0.6 : 0;
  const c = size / 2;
  const slices: { i: number; v: number; a0: number; a1: number }[] = [];
  for (let i = 0, angle = -Math.PI / 2; i < values.length; i++) {
    const a1 = angle + (values[i] / total) * Math.PI * 2;
    if (values[i] > 0) slices.push({ i, v: values[i], a0: angle, a1 });
    angle = a1;
  }

  const arc = (a0: number, a1: number, r: number, r0: number) => {
    if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;   // a full circle
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a: number, rr: number) => `${c + rr * Math.cos(a)},${c + rr * Math.sin(a)}`;
    return r0 > 0
      ? `M${p(a0, r)}A${r},${r} 0 ${large} 1 ${p(a1, r)}L${p(a1, r0)}A${r0},${r0} 0 ${large} 0 ${p(a0, r0)}Z`
      : `M${c},${c}L${p(a0, r)}A${r},${r} 0 ${large} 1 ${p(a1, r)}Z`;
  };
  const pct = (v: number) => `${((v / total) * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;

  return (
    <div ref={ref} className="ch_plot ch_plot--round" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <div className="ch_round">
          <svg width={size} height={size} role="img" aria-label={spec.title}>
            {slices.map((s) => (
              <path
                key={s.i}
                d={arc(s.a0, s.a1, hover === s.i ? R + 4 : R, inner)}
                fill={sliceColor(s.i)}
                stroke="var(--ch-surface)"
                strokeWidth={2}
                className={`ch_slice ${hover !== null && hover !== s.i ? "is_dim" : ""}`}
                onMouseEnter={() => setHover(s.i)}
                onClick={() => setHover(s.i)}
              />
            ))}
            {inner > 0 && (
              <>
                <text x={c} y={c - 6} textAnchor="middle" className="ch_center_value">{hover !== null ? formatValue(values[hover], spec) : formatValue(values.reduce((a, v) => a + v, 0), spec)}</text>
                <text x={c} y={c + 14} textAnchor="middle" className="ch_center_label">{hover !== null ? ellipsis(spec.categories[hover], 18) : "Total"}</text>
              </>
            )}
          </svg>
          <ul className="ch_shares">
            {spec.categories.map((cat, i) => (
              <li key={i}>
                <button
                  type="button"
                  className={`${hover === i && !hidden.has(i) ? "is_on" : ""} ${hidden.has(i) ? "is_off" : ""}`}
                  onMouseEnter={() => setHover(hidden.has(i) ? null : i)}
                  onClick={() => onToggle(i)}
                  aria-pressed={!hidden.has(i)}
                  title={hidden.has(i) ? "Show" : "Hide"}
                >
                  <span className="ch_swatch" style={{ background: sliceColor(i) }} />
                  <span className="ch_shares__name">{cat}</span>
                  <span className="ch_shares__value">{formatValue(spec.series[0].values[i], spec)}</span>
                  <span className="ch_shares__pct">{hidden.has(i) ? "" : pct(values[i])}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const ChartTable = ({ spec }: { spec: ChartSpec }) => {
  const round = spec.type === "pie" || spec.type === "donut";
  const total = round ? spec.series[0].values.reduce<number>((a, v) => a + Math.max(v ?? 0, 0), 0) || 1 : 1;
  return (
    <div className="ch_table_wrap">
      <table className="ch_table">
        <thead>
          <tr>
            <th>{spec.x_label || ""}</th>
            {spec.series.map((s, i) => <th key={i} className="is_num">{s.name}</th>)}
            {round && <th className="is_num">Share</th>}
          </tr>
        </thead>
        <tbody>
          {spec.categories.map((c, r) => (
            <tr key={r}>
              <th scope="row">{c}</th>
              {spec.series.map((s, i) => <td key={i} className="is_num">{formatValue(s.values[r], spec)}</td>)}
              {round && <td className="is_num">{(((spec.series[0].values[r] ?? 0) / total) * 100).toFixed(1)}%</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
