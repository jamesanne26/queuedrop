import { createClient } from "@/lib/supabase/server";
import { startSubscriptionCheckout } from "./actions";

type Props = { searchParams: Promise<{ error?: string; payment?: string }> };

type BillingOrder = {
  id: string;
  status: string;
  amount: number | string;
  currency: string;
  provider: string | null;
  created_at: string;
  plans: { name: string } | { name: string }[] | null;
};

type EffectiveTerms = {
  plan_name?: string;
  status?: string;
  currency?: string;
  monthly_price?: number;
  max_branches?: number | null;
  max_active_queues_per_branch?: number | null;
  max_services_per_branch?: number | null;
  override_active?: boolean;
};

export default async function SubscriptionPage({ searchParams }: Props) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id,businesses(name)")
    .eq("user_id", auth.user!.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const plansPromise = supabase
    .from("plans")
    .select("id,name,description,min_branches,max_branches,price_monthly,price_yearly,currency,max_active_queues_per_branch,max_services_per_branch,trial_days")
    .eq("is_active", true)
    .eq("is_public", true)
    .eq("accepts_new_subscriptions", true)
    .order("sort_order");

  const ordersPromise = membership
    ? supabase.from("subscription_orders").select("id,status,amount,currency,provider,created_at,plans(name)").eq("business_id", membership.business_id).order("created_at", { ascending: false }).limit(5)
    : null;
  const termsPromise = membership ? supabase.rpc("get_effective_subscription_terms", { target_business_id: membership.business_id }) : null;

  const plansResult = await plansPromise;
  const ordersResult = ordersPromise ? await ordersPromise : { data: [] };
  const termsResult = termsPromise ? await termsPromise : { data: null };
  const plans = plansResult.data ?? [];
  const orders = (ordersResult.data ?? []) as unknown as BillingOrder[];
  const terms = (termsResult.data ?? null) as EffectiveTerms | null;

  return (
    <section className="client-content">
      <div className="client-hero"><p className="eyebrow">Subscription & billing</p><h1>QueueDrop plan</h1><p className="muted">Choose a plan and pay online through the configured payment gateway.</p></div>
      {query.error ? <div className="notice notice-error">{query.error}</div> : null}
      {query.payment === "success" ? <div className="notice notice-success">Payment was submitted. QueueDrop will confirm it from the payment webhook.</div> : null}
      {query.payment === "cancelled" ? <div className="notice notice-error">Checkout was cancelled. No plan change was applied.</div> : null}

      <section className="dashboard-section">
        <p className="eyebrow">Current subscription</p>
        <h2>{terms?.plan_name ?? "No active subscription yet"}</h2>
        {terms ? (
          <div className="subscription-summary-grid">
            <span>Status <strong>{terms.status}</strong></span>
            <span>Monthly price <strong>₱{Number(terms.monthly_price ?? 0).toLocaleString()}</strong></span>
            <span>Branches <strong>{terms.max_branches ?? "Custom / unlimited"}</strong></span>
            <span>Active queues / branch <strong>{terms.max_active_queues_per_branch ?? "Custom / unlimited"}</strong></span>
            <span>Services / branch <strong>{terms.max_services_per_branch ?? "Custom / unlimited"}</strong></span>
            {terms.override_active ? <span>Pricing/limits <strong>Custom client override</strong></span> : null}
          </div>
        ) : <p className="muted">Select a plan below to start.</p>}
      </section>

      <div className="pricing-grid client-pricing-grid">
        {plans.map((plan) => (
          <article className="pricing-card" key={plan.id}>
            <p className="eyebrow">{plan.max_branches ? `Up to ${plan.max_branches} branches` : `${plan.min_branches ?? 1}+ branches / custom`}</p>
            <h2>{plan.name}</h2>
            <div className="pricing-price">₱{Number(plan.price_monthly).toLocaleString()}<span>/month</span></div>
            <p>{plan.description}</p>
            <ul>
              <li>{plan.max_active_queues_per_branch ? `${plan.max_active_queues_per_branch} active queues / branch` : "Custom active queues"}</li>
              <li>{plan.max_services_per_branch ? `${plan.max_services_per_branch} services / branch` : "Custom/unlimited services"}</li>
            </ul>
            <form action={startSubscriptionCheckout}><input type="hidden" name="plan_id" value={plan.id} /><button className="button button-primary" type="submit">Subscribe & pay online</button></form>
          </article>
        ))}
      </div>

      <section className="dashboard-section">
        <p className="eyebrow">Recent billing activity</p><h2>Checkout history</h2>
        <div className="system-list-stack">{orders.map((order) => {
          const relation = order.plans;
          const planName = Array.isArray(relation) ? relation[0]?.name : relation?.name;
          return <article className="system-list-row" key={order.id}><div><strong>{planName ?? "Plan"}</strong><span>{new Date(order.created_at).toLocaleString()}</span></div><b>{order.status}</b></article>;
        })}</div>
      </section>
    </section>
  );
}
