import { useEffect, useState } from "react";
import { Check, CreditCard, LoaderCircle, ShieldCheck } from "lucide-react";
import { auth } from "@/shared/lib/firebase";
import { Button, ConfirmDialog } from "@/shared/ui/ui";
import { formatTokens } from "@/features/insights/api/insights_api";
import { BILLING_CHANGED, billingApi, rupees, type BillingOverview, type BillingPeriod, type PlanId } from "@/features/billing/api/billing_api";

/* Razorpay Checkout (loaded on demand from Razorpay's CDN). */
type RazorpayResponse = { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string };
type RazorpayOptions = {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (r: RazorpayResponse) => void;
  modal?: { ondismiss?: () => void };
};
declare global {
  interface Window { Razorpay?: new (o: RazorpayOptions) => { open: () => void; on: (e: string, cb: (r: { error?: { description?: string } }) => void) => void } }
}

let checkoutScript: Promise<void> | null = null;
const loadCheckout = () => {
  checkoutScript ??= new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => { checkoutScript = null; reject(new Error("Couldn't load Razorpay Checkout — check your connection.")); };
    document.body.appendChild(s);
  });
  return checkoutScript;
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

export const BillingPage = () => {
  const [data, setData] = useState<BillingOverview | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [busy, setBusy] = useState<PlanId | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    billingApi.overview().then((d) => { setData(d); if (d.subscription?.period) setPeriod(d.subscription.period); }).catch((e) => setError(e.message));
  }, []);

  const subscribe = async (plan: PlanId) => {
    setBusy(plan);
    setError(null);
    setNotice(null);
    try {
      const start = await billingApi.subscribe(plan, period);
      await loadCheckout();
      if (!window.Razorpay) throw new Error("Razorpay Checkout isn't available");
      const user = auth.currentUser;
      const rzp = new window.Razorpay({
        key: start.keyId,
        subscription_id: start.subscriptionId,
        name: "Owl",
        description: `${data?.plans.find((p) => p.id === plan)?.name} · ${period}`,
        prefill: { name: user?.displayName ?? undefined, email: user?.email ?? undefined, contact: user?.phoneNumber ?? undefined },
        theme: { color: "#59a5d8" },
        handler: async (resp) => {
          try {
            setData(await billingApi.verify(resp));
            setNotice("Payment successful — your plan is active.");
            window.dispatchEvent(new Event(BILLING_CHANGED));
          } catch (e) {
            setError(e instanceof Error ? e.message : "We couldn't confirm the payment yet. It will update automatically in a minute.");
          } finally {
            setBusy(null);
          }
        },
        modal: { ondismiss: () => setBusy(null) },
      });
      rzp.on("payment.failed", (r) => setError(r.error?.description ?? "The payment failed. You haven't been charged."));
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start checkout");
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    setError(null);
    try {
      setData(await billingApi.cancel());
      window.dispatchEvent(new Event(BILLING_CHANGED));
      setConfirmCancel(false);
      setNotice("Your plan won't renew. You keep it until the end of the period you've paid for.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel");
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return (
      <div className="ag_page">
        <h1 className="ag_page__title">Plan & billing</h1>
        {error ? <div className="ag_error">{error}</div> : <div className="bl_loading"><LoaderCircle size={18} className="spin" /> Loading…</div>}
      </div>
    );
  }

  const current = data.plans.find((p) => p.id === data.plan)!;
  const sub = data.subscription;
  const pct = data.usage.quota ? Math.min(100, (data.usage.used / data.usage.quota) * 100) : 0;
  const paidActive = !!sub && sub.plan !== "free" && !sub.cancelAtCycleEnd;
  const yearlySaving = (p: BillingOverview["plans"][number]) => p.price.monthly ? Math.round(100 - (p.price.yearly / (p.price.monthly * 12)) * 100) : 0;

  return (
    <div className="ag_page bl_page">
      <header className="ag_page__header">
        <div>
          <h1 className="ag_page__title">Plan & billing</h1>
          <p className="ag_page__subtitle">
            Each plan includes a monthly token allowance for chats, agents, schedules, pipelines and WhatsApp.
            Chats on <a href="/settings/keys">your own API keys</a> don't use it.
          </p>
        </div>
      </header>

      {!data.paymentsEnabled && <div className="bl_banner">Payments aren't set up on this server yet — plans are shown for preview.</div>}
      {error && <div className="ag_error">{error}</div>}
      {notice && <div className="bl_notice"><Check size={15} /> {notice}</div>}

      <section className="ag_section bl_current">
        <div className="bl_current__head">
          <div>
            <span className="ag_field__label">Current plan</span>
            <h2 className="bl_current__plan">{current.name}{sub && <span className={`bl_status bl_status--${sub.cancelAtCycleEnd ? "ending" : sub.status}`}>{sub.cancelAtCycleEnd ? "Ends " + fmtDate(sub.currentEnd) : sub.status}</span>}</h2>
            <p className="ag_muted ag_small">
              {sub && sub.plan !== "free"
                ? sub.cancelAtCycleEnd
                  ? `You'll move to Free on ${fmtDate(sub.currentEnd)}.`
                  : `${sub.period === "yearly" ? "Yearly" : "Monthly"} · renews ${fmtDate(sub.currentEnd)}`
                : "Upgrade any time — you're only charged once you confirm in Razorpay."}
            </p>
          </div>
          {paidActive && <Button variant="ghost" onClick={() => setConfirmCancel(true)}>Cancel plan</Button>}
        </div>

        <div className="bl_meter" aria-label="Tokens used this month">
          <div className="bl_meter__labels">
            <span><strong>{formatTokens(data.usage.used)}</strong> of {formatTokens(data.usage.quota)} tokens used</span>
            <span className="ag_muted ag_small">{data.usage.exempt ? "Unlimited (owner)" : `Resets ${fmtDate(data.usage.resetsAt)}`}</span>
          </div>
          <div className="bl_meter__track"><div className={`bl_meter__fill ${pct >= 90 ? "is_high" : ""}`} style={{ width: `${data.usage.exempt ? 0 : pct}%` }} /></div>
          {!data.enforced && <span className="ag_muted ag_small">Limits aren't enforced yet on this server.</span>}
        </div>
      </section>

      <div className="bl_period">
        <div className="ag_segmented" role="radiogroup" aria-label="Billing period">
          {(["monthly", "yearly"] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={period === p} className={period === p ? "is_active" : ""} onClick={() => setPeriod(p)}>
              {p === "monthly" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
        {period === "yearly" && <span className="ag_muted ag_small">Save up to {Math.max(...data.plans.map(yearlySaving))}% with yearly billing</span>}
      </div>

      <div className="bl_plans">
        {data.plans.map((p) => {
          const isCurrent = p.id === data.plan;
          const price = p.price[period];
          const canBuy = p.id !== "free" && data.paymentsEnabled && p.available[period] && !paidActive;
          return (
            <article key={p.id} className={`bl_plan ${isCurrent ? "is_current" : ""} ${p.id === "pro" ? "is_featured" : ""}`}>
              {p.id === "pro" && <span className="bl_plan__flag">Most popular</span>}
              <h3 className="bl_plan__name">{p.name}</h3>
              <p className="ag_muted ag_small">{p.tagline}</p>
              <div className="bl_plan__price">
                <strong>{price ? rupees(period === "yearly" ? Math.round(price / 12 / 100) * 100 : price) : "₹0"}</strong>
                <span className="ag_muted">/ month</span>
              </div>
              <p className="ag_muted ag_small bl_plan__billed">{price && period === "yearly" ? `${rupees(price)} billed yearly` : price ? "Billed monthly" : "Free forever"}</p>
              <p className="bl_plan__tokens">{formatTokens(p.monthlyTokens)} tokens / month</p>
              <ul className="bl_plan__features">{p.features.map((f) => <li key={f}><Check size={14} /> {f}</li>)}</ul>
              {isCurrent ? (
                <Button variant="secondary" disabled>Current plan</Button>
              ) : p.id === "free" ? (
                <Button variant="ghost" disabled>{paidActive ? "Cancel your plan to switch" : "Included"}</Button>
              ) : (
                <Button variant="primary" busy={busy === p.id} disabled={!canBuy || !!busy} onClick={() => subscribe(p.id)}
                  title={!data.paymentsEnabled ? "Payments aren't set up yet" : !p.available[period] ? `${p.name} ${period} isn't set up yet` : paidActive ? "Cancel your current plan first" : undefined}>
                  <CreditCard size={15} /> {paidActive ? "Cancel current plan first" : `Get ${p.name}`}
                </Button>
              )}
            </article>
          );
        })}
      </div>
      <p className="ag_muted ag_small bl_secure"><ShieldCheck size={14} /> Payments are processed by Razorpay (UPI, cards, netbanking). Owl never sees your card or UPI details.</p>

      <section className="ag_section">
        <h2 className="ag_section__title">Payment history</h2>
        {data.payments.length === 0 ? <p className="ag_muted ag_small">No payments yet.</p> : (
          <table className="use_table">
            <thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead>
            <tbody>
              {data.payments.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDate(p.createdAt)}</td>
                  <td>{data.plans.find((x) => x.id === p.plan)?.name ?? p.plan ?? "—"}</td>
                  <td>{rupees(p.amount)}</td>
                  <td><span className={`bl_status bl_status--${p.status}`}>{p.status}</span></td>
                  <td className="ag_mono ag_small">{p.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {confirmCancel && (
        <ConfirmDialog
          title="Cancel your plan?"
          message={`It won't renew. You keep ${current.name} until ${fmtDate(sub?.currentEnd ?? null)}, then move to Free.`}
          confirmLabel="Cancel plan"
          busy={busy === "cancel"}
          onConfirm={cancel}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </div>
  );
};
