import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table2 } from "lucide-react";
import { insightsApi, formatTokens, type UsageSummary } from "@/features/insights/api/insights_api";
import { Button } from "@/shared/ui/ui";

// Validated categorical slots (dataviz palette 1, 3, 2), bottom → top of each column.
const SERIES = [
  { key: "input_tokens", label: "Input", color: "#2a78d6" },
  { key: "cache_tokens", label: "Cached input", color: "#1baf7a" },
  { key: "output_tokens", label: "Output", color: "#eb6834" },
] as const;

const SOURCE_LABELS: Record<string, string> = {
  chat: "Web chat", agent: "Agents & schedules", whatsapp: "WhatsApp", telegram: "Telegram", pipeline: "Pipelines", agent_builder: "“Generate with AI”",
};

const RANGES = [7, 30, 90];

const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const fmtUsd = (n: number) => (n < 0.01 && n > 0 ? "< $0.01" : `$${n.toFixed(2)}`);

type Day = { day: string; input_tokens: number; cache_tokens: number; output_tokens: number; total: number; requests: number };

// Fills days with no usage so the time axis has no gaps.
function fillDays(summary: UsageSummary): Day[] {
  const byDay = new Map(summary.byDay.map((d) => [d.day, d]));
  const out: Day[] = [];
  const today = new Date();
  for (let i = summary.days - 1; i >= 0; i--) {
    const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const d = byDay.get(key);
    const cache = (d?.cache_read_tokens ?? 0) + (d?.cache_write_tokens ?? 0);
    out.push({
      day: key,
      input_tokens: d?.input_tokens ?? 0,
      cache_tokens: cache,
      output_tokens: d?.output_tokens ?? 0,
      total: d?.total_tokens ?? 0,
      requests: d?.requests ?? 0,
    });
  }
  return out;
}

const DailyChart = ({ days }: { days: Day[] }) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.total));
  // Round the axis top up to a tidy number.
  const step = 10 ** Math.floor(Math.log10(max));
  const top = Math.ceil(max / step) * step;
  const ticks = [0, top / 2, top];
  const labelEvery = Math.ceil(days.length / 10);

  return (
    <div className="use_chart">
      <div className="use_chart__plot">
        <div className="use_chart__axis">
          {ticks.slice().reverse().map((t) => <span key={t}>{formatTokens(t)}</span>)}
        </div>
        <div className="use_chart__area" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => <div key={t} className="use_chart__grid" style={{ bottom: `${(t / top) * 100}%` }} />)}
          <div className="use_chart__cols">
            {days.map((d, i) => (
              <div key={d.day} className="use_chart__slot" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${fmtDay(d.day)}: ${d.total.toLocaleString()} tokens`}>
                <div className="use_chart__col" style={{ height: `${(d.total / top) * 100}%` }}>
                  {SERIES.map((s) => {
                    const v = d[s.key];
                    return v > 0 ? <div key={s.key} className="use_chart__seg" style={{ flexGrow: v, background: s.color }} /> : null;
                  })}
                </div>
                {i % labelEvery === 0 && <span className="use_chart__x">{fmtDay(d.day)}</span>}
                {hover === i && (
                  <div className={`use_tip ${i > days.length * 0.6 ? "use_tip--left" : ""}`} role="tooltip">
                    <strong>{fmtDay(d.day)}</strong>
                    {SERIES.slice().reverse().map((s) => (
                      <div key={s.key} className="use_tip__row"><span className="use_swatch" style={{ background: s.color }} />{s.label}<span>{d[s.key].toLocaleString()}</span></div>
                    ))}
                    <div className="use_tip__row use_tip__total">Total<span>{d.total.toLocaleString()}</span></div>
                    <div className="use_tip__row ag_muted">{d.requests} model call{d.requests === 1 ? "" : "s"}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="use_legend" aria-label="Legend">
        {SERIES.map((s) => <span key={s.key}><span className="use_swatch" style={{ background: s.color }} />{s.label}</span>)}
      </div>
    </div>
  );
};

export const UsagePage = () => {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [table, setTable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    insightsApi.usageSummary(days)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [days]);

  const series = useMemo(() => (data ? fillDays(data) : []), [data]);
  const t = data?.totals;
  const cached = t ? t.cache_read_tokens + t.cache_write_tokens : 0;

  return (
    <div className="ag_page use_page">
      <header className="ag_page__header">
        <div>
          <h1 className="ag_page__title">Usage</h1>
          <p className="ag_page__subtitle">Tokens used by your chats, agents, schedules, pipelines and WhatsApp.</p>
        </div>
        <div className="ag_segmented" role="radiogroup" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r} type="button" role="radio" aria-checked={days === r} className={days === r ? "is_active" : ""} onClick={() => { setData(null); setDays(r); }}>
              {r} days
            </button>
          ))}
        </div>
      </header>

      {error && <div className="ag_error">{error}</div>}
      {!data && !error && <div className="use_tiles">{[0, 1, 2, 3].map((i) => <div key={i} className="ag_card ag_card--skeleton use_tile" />)}</div>}

      {data && t && (
        <>
          <div className="use_tiles">
            <div className="use_tile use_tile--hero">
              <span className="use_tile__label">Total tokens</span>
              <span className="use_tile__value">{formatTokens(t.total_tokens)}</span>
              <span className="use_tile__sub">{t.total_tokens.toLocaleString()} · {t.requests.toLocaleString()} model calls</span>
            </div>
            <div className="use_tile">
              <span className="use_tile__label">Input</span>
              <span className="use_tile__value">{formatTokens(t.input_tokens)}</span>
              <span className="use_tile__sub">what was sent to the model</span>
            </div>
            <div className="use_tile">
              <span className="use_tile__label">Cached input</span>
              <span className="use_tile__value">{formatTokens(cached)}</span>
              <span className="use_tile__sub">reused from the prompt cache — much cheaper</span>
            </div>
            <div className="use_tile">
              <span className="use_tile__label">Output</span>
              <span className="use_tile__value">{formatTokens(t.output_tokens)}</span>
              <span className="use_tile__sub">what the model wrote</span>
            </div>
            <div className="use_tile">
              <span className="use_tile__label">Estimated cost</span>
              <span className="use_tile__value">{fmtUsd(data.estimated_cost_usd)}</span>
              <span className="use_tile__sub">{data.cost_is_partial ? "some models have no price set — partial" : "from list prices; check your provider bill"}</span>
            </div>
          </div>

          <section className="ag_section">
            <div className="ag_section__head">
              <h2 className="ag_section__title">Tokens per day</h2>
              <Button variant="ghost" onClick={() => setTable((v) => !v)}><Table2 size={14} /> {table ? "Show chart" : "Show table"}</Button>
            </div>
            {t.total_tokens === 0 ? (
              <p className="ag_muted">No usage in this period yet — send a message and come back.</p>
            ) : table ? (
              <div className="use_table_wrap">
                <table className="use_table">
                  <thead><tr><th>Day</th><th>Input</th><th>Cached input</th><th>Output</th><th>Total</th><th>Calls</th></tr></thead>
                  <tbody>
                    {series.filter((d) => d.total > 0).reverse().map((d) => (
                      <tr key={d.day}><td>{fmtDay(d.day)}</td><td>{d.input_tokens.toLocaleString()}</td><td>{d.cache_tokens.toLocaleString()}</td><td>{d.output_tokens.toLocaleString()}</td><td><strong>{d.total.toLocaleString()}</strong></td><td>{d.requests}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <DailyChart days={series} />
            )}
          </section>

          <div className="use_grid">
            <section className="ag_section">
              <h2 className="ag_section__title">By model</h2>
              <table className="use_table">
                <thead><tr><th>Model</th><th>Tokens</th><th>Calls</th><th>Est. cost</th></tr></thead>
                <tbody>
                  {data.byModel.slice().sort((a, b) => b.total_tokens - a.total_tokens).map((m) => (
                    <tr key={`${m.provider}:${m.model}:${m.byok ? 1 : 0}`}>
                      <td><span className="use_model">{m.model ?? "unknown"}</span><span className="ag_muted ag_small"> {m.provider === "anthropic" ? "Claude" : m.provider === "openai" ? "ChatGPT" : m.provider === "marketplace" ? "Marketplace" : m.provider}{m.provider === "marketplace" ? " · credits" : m.byok ? " · your key" : ""}</span></td>
                      <td>{formatTokens(m.total_tokens)}</td>
                      <td>{m.requests}</td>
                      <td>{m.cost_usd === null ? <span className="ag_muted">—</span> : fmtUsd(m.cost_usd)}</td>
                    </tr>
                  ))}
                  {data.byModel.length === 0 && <tr><td colSpan={4} className="ag_muted">No usage yet</td></tr>}
                </tbody>
              </table>
            </section>

            <section className="ag_section">
              <h2 className="ag_section__title">By feature</h2>
              <div className="use_bars">
                {data.bySource.slice().sort((a, b) => b.total_tokens - a.total_tokens).map((s) => {
                  const pct = t.total_tokens ? (s.total_tokens / t.total_tokens) * 100 : 0;
                  return (
                    <div key={s.source} className="use_bar_row">
                      <span className="use_bar_row__label">{SOURCE_LABELS[s.source] ?? s.source}</span>
                      <div className="use_bar_row__track"><div className="use_bar_row__fill" style={{ width: `${Math.max(pct, 1)}%` }} /></div>
                      <span className="use_bar_row__value">{formatTokens(s.total_tokens)} <span className="ag_muted">· {pct.toFixed(0)}%</span></span>
                    </div>
                  );
                })}
                {data.bySource.length === 0 && <p className="ag_muted ag_small">No usage yet</p>}
              </div>
            </section>
          </div>

          <section className="ag_section">
            <h2 className="ag_section__title">Chats using the most tokens</h2>
            {data.topChats.length === 0 ? <p className="ag_muted ag_small">No chats in this period.</p> : (
              <div className="use_top">
                {data.topChats.map((c, i) => (
                  <button key={c.session_id} type="button" className="use_top__row" onClick={() => navigate(`/chathome?session=${c.session_id}`)}>
                    <span className="use_top__rank">{i + 1}</span>
                    <span className="use_top__title">{c.title || "New Chat"}</span>
                    <span className="ag_muted ag_small">{c.requests} calls</span>
                    <strong>{formatTokens(c.total_tokens)}</strong>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
