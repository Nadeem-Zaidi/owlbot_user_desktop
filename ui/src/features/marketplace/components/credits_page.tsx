import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, CreditCard, LoaderCircle, ShieldCheck, Wallet as WalletIcon } from "lucide-react";
import { auth } from "@/shared/lib/firebase";
import { Button, ErrorNote } from "@/shared/ui/ui";
import { fmtInr, fmtUsd, marketApi, type LedgerEntry, type MarketConfig, type Wallet , errorText, CREDITS_CHANGED } from "@/features/marketplace/api/market_api";

const PRESETS = [5, 10, 25, 50, 100];

/* Razorpay Checkout for a one-time order (script loaded on demand). */
type OrderCheckout = {
  key: string; order_id: string; amount: number; currency: string; name: string; description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  modal?: { ondismiss?: () => void };
};
type RazorpayCtor = new (o: OrderCheckout) => { open: () => void; on: (e: string, cb: (r: { error?: { description?: string } }) => void) => void };
let checkoutScript: Promise<void> | null = null;
const loadCheckout = () => {
  checkoutScript ??= new Promise<void>((resolve, reject) => {
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => { checkoutScript = null; reject(new Error("Couldn't load Razorpay Checkout — check your connection.")); };
    document.body.appendChild(s);
  });
  return checkoutScript;
};

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const describe = (e: LedgerEntry) => {
  if (e.kind === "purchase") return "Credits purchased";
  if (e.kind === "adjustment") return e.note ? `Credit added — ${e.note}` : "Credit added";
  if (e.kind === "refund") return e.note ? `Credit removed — ${e.note}` : "Credit removed";
  return e.model ?? "Model usage";
};

// Prepaid credits for marketplace models (chat and developer API): buy with
// Razorpay, see the balance, what was spent on which model, and every charge.
export const CreditsPage = () => {
  const [cfg, setCfg] = useState<MarketConfig | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [amount, setAmount] = useState(10);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => Promise.all([marketApi.config(), marketApi.wallet()])
    .then(([c, w]) => { setCfg(c); setWallet(w); setLedger(w.ledger); setHasMore(w.ledger.length >= 30); })
    .catch((e) => setError(errorText(e)));
  useEffect(() => { void load(); }, []);

  const usd = custom ? Number(custom) : amount;
  const valid = !!cfg && Number.isFinite(usd) && usd >= cfg.minTopupUsd && usd <= cfg.maxTopupUsd;
  const base = cfg ? Math.round(usd * cfg.usdInr * 100) / 100 : 0;
  const fee = cfg ? Math.round(base * cfg.purchaseFeePct) / 100 : 0;
  const total = Math.round((base + fee) * 100) / 100;

  const buy = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const start = await marketApi.topup(usd);
      await loadCheckout();
      const Razorpay = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
      if (!Razorpay) throw new Error("Razorpay Checkout isn't available");
      const user = auth.currentUser;
      const rzp = new Razorpay({
        key: start.keyId,
        order_id: start.orderId,
        amount: start.amountPaise,
        currency: "INR",
        name: "Owl",
        description: `${fmtUsd(start.creditsUsd)} of model credits`,
        prefill: { name: user?.displayName ?? undefined, email: user?.email ?? undefined, contact: user?.phoneNumber ?? undefined },
        theme: { color: "#59a5d8" },
        handler: async (resp) => {
          try {
            const w = await marketApi.verifyTopup(resp);
            setWallet(w);
            setLedger(w.ledger);
            setNotice(`Payment successful — ${fmtUsd(start.creditsUsd)} added to your credits.`);
            window.dispatchEvent(new Event(CREDITS_CHANGED));
          } catch (e) {
            setError(errorText(e) || "We couldn't confirm the payment yet. Your credits will appear in a minute.");
          } finally {
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.on("payment.failed", (r) => setError(r.error?.description ?? "The payment failed. You haven't been charged."));
      rzp.open();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const more = async () => {
    const last = ledger[ledger.length - 1];
    if (!last) return;
    try {
      const r = await marketApi.ledger(last.id);
      setLedger((l) => [...l, ...r.entries]);
      setHasMore(r.entries.length >= 50);
    } catch (e) {
      setError(errorText(e));
    }
  };

  if (!wallet || !cfg) {
    return (
      <div className="ag_page mk_page">
        <h1 className="ag_page__title">Credits</h1>
        {error ? <ErrorNote message={error} /> : <div className="st_loading"><LoaderCircle size={18} className="spin" /> Loading…</div>}
      </div>
    );
  }

  return (
    <div className="ag_page mk_page">
      <header className="ag_page__header">
        <div>
          <h1 className="ag_page__title">Credits</h1>
          <p className="ag_page__subtitle">Prepaid balance for <Link to="/models">marketplace models</Link> — in chat and through the <Link to="/developer">developer API</Link>. Your plan's included tokens are separate.</p>
        </div>
      </header>
      <ErrorNote message={error} />
      {notice && <div className="mk_notice"><ShieldCheck size={16} /> {notice}</div>}
      {!cfg.enabled && <div className="mk_warn">The model marketplace isn't switched on for this server yet.</div>}

      <div className="mk_wallet">
        <section className="mk_balance">
          <span className="mk_balance__label"><WalletIcon size={15} /> Balance</span>
          <strong className={`mk_balance__value ${wallet.balanceUsd < 0 ? "is_neg" : ""}`}>{fmtUsd(wallet.balanceUsd, 2)}</strong>
          <span className="ag_muted ag_small">≈ {fmtInr(wallet.balanceUsd * cfg.usdInr)}</span>
          {wallet.balanceUsd <= 0 && <span className="mk_balance__hint">Add credits to use marketplace models.</span>}
        </section>

        <section className="mk_buy">
          <h2 className="mk_h2">Add credits</h2>
          <div className="mk_presets">
            {PRESETS.filter((p) => p >= cfg.minTopupUsd && p <= cfg.maxTopupUsd).map((p) => (
              <button key={p} type="button" className={`mk_preset ${!custom && amount === p ? "is_on" : ""}`} onClick={() => { setAmount(p); setCustom(""); }}>${p}</button>
            ))}
            <label className="mk_custom">
              $<input inputMode="decimal" value={custom} placeholder="Other" onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Custom amount in USD" />
            </label>
          </div>
          <dl className="mk_quote">
            <div><dt>Credits</dt><dd>{valid ? fmtUsd(usd, 2) : "—"}</dd></div>
            <div><dt>Price (₹{cfg.usdInr} per $1)</dt><dd>{valid ? fmtInr(base) : "—"}</dd></div>
            <div><dt>Platform fee ({cfg.purchaseFeePct}%)</dt><dd>{valid ? fmtInr(fee) : "—"}</dd></div>
            <div className="mk_quote__total"><dt>You pay</dt><dd>{valid ? fmtInr(total) : "—"}</dd></div>
          </dl>
          {!valid && (custom || amount) ? <p className="ag_small mk_bad">Choose between ${cfg.minTopupUsd} and ${cfg.maxTopupUsd}.</p> : null}
          <Button variant="primary" onClick={() => void buy()} busy={busy} disabled={!valid || !cfg.paymentsEnabled || !cfg.enabled}>
            <CreditCard size={15} /> {valid ? `Pay ${fmtInr(total)}` : "Pay"}
          </Button>
          <p className="ag_muted ag_small mk_secure"><ShieldCheck size={13} /> Secure payment by Razorpay — UPI, cards, net banking. Credits don't expire.</p>
          {!cfg.paymentsEnabled && <p className="ag_small mk_bad">Payments aren't set up on this server.</p>}
        </section>
      </div>

      {wallet.usage30d.length > 0 && (
        <section className="ag_section">
          <h2 className="mk_h2">Last 30 days by model</h2>
          <div className="mk_table_wrap">
            <table className="mk_table">
              <thead><tr><th>Model</th><th className="is_num">Requests</th><th className="is_num">Input tokens</th><th className="is_num">Output tokens</th><th className="is_num">Spent</th></tr></thead>
              <tbody>
                {wallet.usage30d.map((u) => (
                  <tr key={u.model}>
                    <td><Link to={`/models/${u.model}`} className="mk_link">{u.model}</Link></td>
                    <td className="is_num">{u.requests.toLocaleString()}</td>
                    <td className="is_num">{u.inputTokens.toLocaleString()}</td>
                    <td className="is_num">{u.outputTokens.toLocaleString()}</td>
                    <td className="is_num">{fmtUsd(u.spentUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="ag_section">
        <h2 className="mk_h2">Activity</h2>
        {ledger.length ? (
          <div className="mk_table_wrap">
            <table className="mk_table">
              <thead><tr><th>When</th><th>What</th><th>Source</th><th className="is_num">Tokens</th><th className="is_num">Amount</th><th className="is_num">Balance</th></tr></thead>
              <tbody>
                {ledger.map((e) => (
                  <tr key={e.id}>
                    <td className="mk_nowrap">{fmtDateTime(e.createdAt)}</td>
                    <td>
                      <span className={`mk_kind mk_kind--${e.amountUsd >= 0 ? "in" : "out"}`}>{e.amountUsd >= 0 ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}</span>
                      {describe(e)}
                      {e.kind === "purchase" && e.paidInr !== undefined && <span className="ag_muted ag_small"> · paid {fmtInr(e.paidInr)}</span>}
                    </td>
                    <td>{e.source === "api" ? "API" : e.source === "chat" ? "Chat" : e.source === "razorpay" ? "Razorpay" : e.source ?? "—"}</td>
                    <td className="is_num">{e.kind === "usage" ? (e.inputTokens + e.outputTokens).toLocaleString() : ""}</td>
                    <td className={`is_num ${e.amountUsd >= 0 ? "mk_pos" : ""}`}>{e.amountUsd >= 0 ? "+" : ""}{fmtUsd(e.amountUsd)}</td>
                    <td className="is_num">{fmtUsd(e.balanceAfterUsd, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="ag_muted">No activity yet.</p>}
        {hasMore && <div className="mk_more"><Button onClick={() => void more()}>Load more</Button></div>}
      </section>
    </div>
  );
};
