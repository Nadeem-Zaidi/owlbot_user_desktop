import { BaseApi } from "@/shared/api/base_fetch";

export type PlanId = "free" | "pro" | "business";
export type BillingPeriod = "monthly" | "yearly";

export type BillingOverview = {
  paymentsEnabled: boolean;
  enforced: boolean;
  keyId: string | null;
  plan: PlanId;
  subscription: { id: string; plan: PlanId; period: BillingPeriod; status: string; currentEnd: string | null; cancelAtCycleEnd: boolean } | null;
  usage: { used: number; quota: number; resetsAt: string; exempt: boolean };
  plans: {
    id: PlanId;
    name: string;
    tagline: string;
    monthlyTokens: number;
    price: Record<BillingPeriod, number>; // paise
    features: string[];
    available: Record<BillingPeriod, boolean>;
  }[];
  payments: { id: string; plan: string | null; amount: number; currency: string; status: string; createdAt: string }[];
};

export type CheckoutStart = { subscriptionId: string; keyId: string; plan: PlanId; period: BillingPeriod; amount: number };

// Client for /api/billing (backend routes/billing_routes.ts).
class BillingApi extends BaseApi {
  constructor() {
    super(import.meta.env.VITE_API_URL);
  }
  overview() { return this.get<BillingOverview>("/billing"); }
  subscribe(plan: PlanId, period: BillingPeriod) { return this.post<CheckoutStart>("/billing/subscribe", { plan, period }); }
  verify(body: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) { return this.post<BillingOverview>("/billing/verify", body); }
  cancel() { return this.post<BillingOverview>("/billing/cancel", {}); }
}

export const billingApi = new BillingApi();

// Fired on window after a payment or cancellation, so e.g. the sidebar refreshes.
export const BILLING_CHANGED = "owlbot:billing-changed";

export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
