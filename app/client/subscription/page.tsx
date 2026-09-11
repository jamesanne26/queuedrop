import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { startSubscriptionCheckout } from "./actions";

type Props = { searchParams: Promise<{ error?: string; payment?: string }> };

type BillingOrder = {
  id: string;
  status: string;
  amount: number | string;
  currency: string;
  provider: string | null;
  billing_interval: "monthly" | "yearly";
  renewal_mode: "manual" | "auto";
  created_at: string;
  subtotal: number | string; tax_mode: "non_vat" | "vat"; vat_rate: number | string; tax_amount: number | string;
  plans: { name: string } | { name: string }[] | null;
};

type EffectiveTerms = {
  plan_name?: string;
  status?: string;
  currency?: string;
  monthly_price?: number;
  yearly_price?: number | null;
  current_cycle_price?: number;
  billing_interval?: "monthly" | "yearly";
  renewal_mode?: "manual" | "auto";
  next_billing_at?: string | null;
  expires_at?: string | null;
  max_branches?: number | null;
  max_active_queues_per_branch?: number | null;
  max_services_per_branch?: number | null;
  override_active?: boolean;
};

function peso(value: number | string | null | undefined) {
  return `₱${Number(value ?? 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

export default async function SubscriptionPage({ searchParams }: Props) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/auth/login?next=%2Fclient%2Fsubscription");
  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id,role,businesses(name)")
    .eq("user_id", auth.user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!membership || !["owner", "admin"].includes(membership.role)) redirect("/dashboard");

  const plansPromise = supabase
    .from("plans")
    .select("id,name,description,min_branches,max_branches,price_monthly,price_yearly,currency,max_active_queues_per_branch,max_services_per_branch,trial_days,allow_auto_renew,tax_mode,vat_rate,tax_price_mode")
    .eq("is_active", true)
    .eq("is_public", true)
    .eq("accepts_new_subscriptions", true)
    .order("sort_order");

  const ordersPromise = supabase
    .from("subscription_orders")
    .select("id,status,amount,subtotal,tax_mode,vat_rate,tax_amount,currency,provider,billing_interval,renewal_mode,created_at,plans(name)")
    .eq("business_id", membership.business_id)
    .order("created_at", { ascending: false })
    .limit(5);
  const termsPromise = supabase.rpc("get_effective_subscription_terms", { target_business_id: membership.business_id });

  const [plansResult, ordersResult, termsResult] = await Promise.all([plansPromise, ordersPromise, termsPromise]);
  const plans = plansResult.data ?? [];
  const orders = (ordersResult.data ?? []) as unknown as BillingOrder[];
  const terms = (termsResult.data ?? null) as EffectiveTerms | null;
  const autoRenewProviderReady = process.env.PAYMONGO_SUBSCRIPTIONS_ENABLED === "true" && Boolean(process.env.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY);

  return (
    <section className="client-content">
      <div className="client-hero">
        <p className="eyebrow">Subscription & billing</p>
        <h1>QueueDrop plan</h1>
        <p className="muted">Choose monthly or annual billing, then choose manual renewal or automatic renewal.</p>
      </div>
      {query.error ? <div className="notice notice-error">{query.error}</div> : null}
      {query.payment === "success" ? <div className="notice notice-success">Payment was submitted. QueueDrop will confirm it from the PayMongo webhook.</div> : null}
      {query.payment === "cancelled" ? <div className="notice notice-error">Checkout was cancelled. No plan change was applied.</div> : null}

      <section className="dashboard-section">
        <p className="eyebrow">Current subscription</p>
        <h2>{terms?.plan_name ?? "No active subscription yet"}</h2>
        {terms ? (
          <div className="subscription-summary-grid">
            <span>Status <strong>{terms.status}</strong></span>
            <span>Billing cycle <strong>{terms.billing_interval === "yearly" ? "Annual" : "Monthly"}</strong></span>
            <span>Renewal <strong>{terms.renewal_mode === "auto" ? "Auto-renew" : "Manual"}</strong></span>
            <span>Current cycle price <strong>{peso(terms.current_cycle_price ?? terms.monthly_price)}</strong></span>
            <span>Branches <strong>{terms.max_branches ?? "Custom / unlimited"}</strong></span>
            <span>Active queues / branch <strong>{terms.max_active_queues_per_branch ?? "Custom / unlimited"}</strong></span>
            <span>Services / branch <strong>{terms.max_services_per_branch ?? "Custom / unlimited"}</strong></span>
            {terms.next_billing_at ? <span>Next auto billing <strong>{new Date(terms.next_billing_at).toLocaleDateString("en-PH")}</strong></span> : null}
            {terms.renewal_mode !== "auto" && terms.expires_at ? <span>Paid through <strong>{new Date(terms.expires_at).toLocaleDateString("en-PH")}</strong></span> : null}
            {terms.override_active ? <span>Pricing/limits <strong>Custom client override</strong></span> : null}
          </div>
        ) : <p className="muted">Select a plan below to start.</p>}
      </section>

      {!autoRenewProviderReady ? (
        <div className="notice">Manual monthly/annual payments are ready now. Auto-renew is built in but stays unavailable until PayMongo enables Subscriptions for this merchant account and the public key is configured.</div>
      ) : null}

      <div className="pricing-grid client-pricing-grid">
        {plans.map((plan) => (
          <article className="pricing-card" key={plan.id}>
            <p className="eyebrow">{plan.max_branches ? `Up to ${plan.max_branches} branches` : `${plan.min_branches ?? 1}+ branches / custom`}</p>
            <h2>{plan.name}</h2>
            <div className="pricing-price">{peso(plan.price_monthly)}<span>/month</span></div>
            {plan.price_yearly ? <p className="pricing-annual">{peso(plan.price_yearly)}/year</p> : null}
            <p className="muted">{plan.tax_mode === "vat" ? `VAT ${Number(plan.vat_rate)}% · ${plan.tax_price_mode === "exclusive" ? "added at checkout" : "included in price"}` : "Non-VAT"}</p>
            <p>{plan.description}</p>
            <ul>
              <li>{plan.max_active_queues_per_branch ? `${plan.max_active_queues_per_branch} active queues / branch` : "Custom active queues"}</li>
              <li>{plan.max_services_per_branch ? `${plan.max_services_per_branch} services / branch` : "Custom/unlimited services"}</li>
            </ul>
            <form action={startSubscriptionCheckout} className="billing-choice-form">
              <input type="hidden" name="plan_id" value={plan.id} />
              <label>Billing cycle
                <select name="billing_interval" defaultValue="monthly">
                  <option value="monthly">Monthly — {peso(plan.price_monthly)}</option>
                  {plan.price_yearly ? <option value="yearly">Annual — {peso(plan.price_yearly)}</option> : null}
                </select>
              </label>
              <label>Renewal
                <select name="renewal_mode" defaultValue="manual">
                  <option value="manual">Manual renewal — Card or GCash</option>
                  {plan.allow_auto_renew ? <option value="auto" disabled={!autoRenewProviderReady}>Auto-renew — Card</option> : null}
                </select>
              </label>
              <button className="button button-primary" type="submit">Continue to payment</button>
            </form>
          </article>
        ))}
      </div>

      <section className="dashboard-section">
        <p className="eyebrow">Recent billing activity</p><h2>Checkout history</h2>
        <div className="system-list-stack">{orders.map((order) => {
          const relation = order.plans;
          const planName = Array.isArray(relation) ? relation[0]?.name : relation?.name;
          return (
            <article className="system-list-row" key={order.id}>
              <div>
                <strong>{planName ?? "Plan"} · {order.billing_interval === "yearly" ? "Annual" : "Monthly"}</strong>
                <span>{order.renewal_mode === "auto" ? "Auto-renew" : "Manual"} · {peso(order.amount)} · {order.tax_mode === "vat" ? `VAT ${Number(order.vat_rate)}% (${peso(order.tax_amount)})` : "Non-VAT"} · {new Date(order.created_at).toLocaleString()}</span>
              </div>
              <b>{order.status}</b>
            </article>
          );
        })}</div>
      </section>
    </section>
  );
}
