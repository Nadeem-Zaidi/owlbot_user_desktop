import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { Button, ErrorNote, Field } from "@/shared/ui/ui";
import { ChartCard } from "@/features/charts/components/chart_card";
import type { ChartSpec } from "@/features/charts/lib/chart_spec";
import { fmtInr, fmtUsd, marketApi, type Earnings , errorText } from "@/features/marketplace/api/market_api";

const RANGES = [7, 30, 90, 365];

// Owner only: what the marketplace earns. Two sources, like OpenRouter:
// the fee on every credit purchase and the (optional) markup on usage.
export const EarningsPage = () => {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Earnings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adjUser, setAdjUser] = useState("");
  const [adjUsd, setAdjUsd] = useState("");
  const [adjNote, setAdjNote] = useState("");
  const [adjBusy, setAdjBusy] = useState(false);
  const [adjDone, setAdjDone] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    marketApi.earnings(days).then(setData).catch((e) => setError(errorText(e)));
  }, [days]);

  const chart = useMemo<ChartSpec | null>(() => {
    if (!data || !data.daily.length) return null;
    return {
      type: "bar",
      stacked: true,
      title: "Earnings per day",
      subtitle: "Purchase fees + usage markup, in ₹",
      format: "currency",
      currency: "₹",
      categories: data.daily.map((d) => new Date(d.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" })),
      series: [
        { name: "Purchase fees", values: data.daily.map((d) => Math.round(d.feesInr * 100) / 100) },
        { name: "Usage markup", values: data.daily.map((d) => Math.round(d.markupUsd * data.usdInr * 100) / 100) },
      ],
    };
  }, [data]);

  const adjust = async () => {
    setAdjBusy(true);
    setError(null);
    setAdjDone(null);
    try {
      const r = await marketApi.adjust(adjUser.trim(), Number(adjUsd), adjNote);
      setAdjDone(`Done — ${r.userId} now has ${fmtUsd(r.balanceUsd, 2)}.`);
      setAdjUsd("");
      setAdjNote("");
      marketApi.earnings(days).then(setData).catch(() => {});
    } catch (e) {
      setError(errorText(e));
    } finally {
      setAdjBusy(false);
    }
  };

  const t = data?.totals;
  return (
    <div className="ag_page mk_page">
      <header className="ag_page__header">
        <div>
          <h1 className="ag_page__title">Earnings</h1>
          <p className="ag_page__subtitle">
            What the model marketplace earns you: a {data?.purchaseFeePct ?? "…"}% fee on every credit purchase
            {data && data.usageMarkupPct > 0 ? ` plus a ${data.usageMarkupPct}% markup on usage` : " (usage is passed through at cost — set MARKET_USAGE_MARKUP_PCT to add a markup)"}.
          </p>
        </div>
        <div className="mk_range" role="tablist" aria-label="Period">
          {RANGES.map((r) => <button key={r} type="button" role="tab" aria-selected={days === r} className={days === r ? "is_on" : ""} onClick={() => setDays(r)}>{r === 365 ? "1y" : `${r}d`}</button>)}
        </div>
      </header>
      <ErrorNote message={error} />

      {!data || !t ? (
        !error && <div className="st_loading"><LoaderCircle size={18} className="spin" /> Loading…</div>
      ) : (
        <>
          <div className="mk_cards">
            <div className="mk_card mk_card--hero"><span>Your earnings</span><strong>{fmtInr(t.earningsInr)}</strong><em>last {data.days} days</em></div>
            <div className="mk_card"><span>Purchase fees</span><strong>{fmtInr(t.feesInr)}</strong><em>{t.purchases} purchase{t.purchases === 1 ? "" : "s"}</em></div>
            <div className="mk_card"><span>Usage markup</span><strong>{fmtUsd(t.markupUsd, 2)}</strong><em>≈ {fmtInr(t.markupUsd * data.usdInr)}</em></div>
            <div className="mk_card"><span>Collected</span><strong>{fmtInr(t.revenueInr)}</strong><em>{fmtUsd(t.creditsSoldUsd, 2)} of credit sold</em></div>
            <div className="mk_card"><span>Usage charged</span><strong>{fmtUsd(t.usageChargedUsd, 2)}</strong><em>Provider cost {fmtUsd(t.upstreamCostUsd, 2)}</em></div>
            <div className="mk_card"><span>Requests</span><strong>{t.requests.toLocaleString()}</strong><em>{t.activeUsers} active user{t.activeUsers === 1 ? "" : "s"}</em></div>
          </div>

          <div className={`mk_health ${data.openrouter && !data.openrouter.coversLiability ? "is_bad" : data.openrouter ? "" : "is_info"}`}>
            {data.openrouter && !data.openrouter.coversLiability ? <CircleAlert size={18} /> : <CircleCheck size={18} />}
            <div>
              <strong>Users hold {fmtUsd(data.liability.usd, 2)} of unspent credit</strong>
              <span>
                Across {data.liability.wallets} wallet{data.liability.wallets === 1 ? "" : "s"} — keep your provider accounts funded above this (see the budget column under By provider).
                {data.openrouter && ` OpenRouter balance: ${fmtUsd(data.openrouter.remainingUsd, 2)}${data.openrouter.coversLiability ? "." : " — top it up so every user's credit can be spent."}`}
              </span>
            </div>
          </div>

          {chart ? <ChartCard spec={chart} /> : <p className="ag_muted">No activity in this period yet.</p>}

          <div className="mk_grid2">
            <section className="ag_section">
              <h2 className="mk_h2">Top models</h2>
              {data.topModels.length ? (
                <table className="mk_table">
                  <thead><tr><th>Model</th><th className="is_num">Requests</th><th className="is_num">Charged</th><th className="is_num">Margin</th></tr></thead>
                  <tbody>{data.topModels.map((m) => (
                    <tr key={m.model}><td><Link to={`/models/${m.model}`} className="mk_link">{m.model}</Link></td><td className="is_num">{m.requests.toLocaleString()}</td><td className="is_num">{fmtUsd(m.chargedUsd)}</td><td className="is_num">{fmtUsd(m.chargedUsd - m.upstreamUsd)}</td></tr>
                  ))}</tbody>
                </table>
              ) : <p className="ag_muted ag_small">No usage yet.</p>}
            </section>
            <section className="ag_section">
              <h2 className="mk_h2">Top customers</h2>
              {data.topUsers.length ? (
                <table className="mk_table">
                  <thead><tr><th>User id</th><th className="is_num">Paid</th><th className="is_num">Used</th></tr></thead>
                  <tbody>{data.topUsers.map((u) => (
                    <tr key={u.userId}><td><code className="mk_mono" title={u.userId}>{u.userId.slice(0, 14)}{u.userId.length > 14 ? "…" : ""}</code></td><td className="is_num">{fmtInr(u.paidInr)}</td><td className="is_num">{fmtUsd(u.usageUsd)}</td></tr>
                  ))}</tbody>
                </table>
              ) : <p className="ag_muted ag_small">No customers yet.</p>}
            </section>
          </div>

          {data.byProvider && data.byProvider.length > 0 && (
            <section className="ag_section">
              <h2 className="mk_h2">By provider</h2>
              <p className="ag_muted ag_small">What each provider cost you and what you charged for its requests. Budgets are set per provider on the Model catalogue page.</p>
              <div className="mk_table_wrap">
                <table className="mk_table">
                  <thead><tr><th>Provider</th><th className="is_num">Requests</th><th className="is_num">Charged</th><th className="is_num">Cost</th><th className="is_num">Margin</th><th>Budget (30 days)</th></tr></thead>
                  <tbody>{data.byProvider.map((p) => (
                    <tr key={p.provider}>
                      <td>{p.provider}</td>
                      <td className="is_num">{p.requests.toLocaleString()}</td>
                      <td className="is_num">{fmtUsd(p.chargedUsd)}</td>
                      <td className="is_num">{fmtUsd(p.costUsd)}</td>
                      <td className="is_num mk_pos">{fmtUsd(p.marginUsd)}</td>
                      <td>
                        {p.budgetUsd === null ? <span className="ag_muted ag_small">No budget set</span> : (
                          <div className="mk_budget">
                            <div className="mk_budget__bar"><span className={(p.budgetUsedPct ?? 0) >= 100 ? "is_over" : (p.budgetUsedPct ?? 0) >= 80 ? "is_warn" : ""} style={{ width: `${Math.min(p.budgetUsedPct ?? 0, 100)}%` }} /></div>
                            <span className="ag_small">{fmtUsd(p.spent30Usd, 2)} of {fmtUsd(p.budgetUsd, 2)}{(p.budgetUsedPct ?? 0) >= 80 ? " — top up soon" : ""}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          )}

          <section className="ag_section">
            <h2 className="mk_h2">All time</h2>
            <p className="ag_small">Collected {fmtInr(data.allTime.revenueInr)} · fees {fmtInr(data.allTime.feesInr)} · usage markup {fmtUsd(data.allTime.markupUsd, 2)}</p>
          </section>

          <section className="ag_section">
            <h2 className="mk_h2">Adjust a user's credit</h2>
            <p className="ag_muted ag_small">For refunds, goodwill credit or corrections. A negative amount removes credit. Every change is recorded in the user's activity.</p>
            <div className="mk_adjust">
              <Field label="User id"><input className="ag_input" value={adjUser} onChange={(e) => setAdjUser(e.target.value)} placeholder="Firebase user id" /></Field>
              <Field label="Amount (USD)"><input className="ag_input" inputMode="decimal" value={adjUsd} onChange={(e) => setAdjUsd(e.target.value.replace(/[^\d.-]/g, ""))} placeholder="e.g. 5 or -2" /></Field>
              <Field label="Note"><input className="ag_input" value={adjNote} maxLength={200} onChange={(e) => setAdjNote(e.target.value)} placeholder="Reason (shown to the user)" /></Field>
              <Button variant="primary" onClick={() => void adjust()} busy={adjBusy} disabled={!adjUser.trim() || !Number(adjUsd)}>Apply</Button>
            </div>
            {adjDone && <p className="ag_small mk_pos">{adjDone}</p>}
          </section>
        </>
      )}
    </div>
  );
};
