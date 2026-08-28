import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

function money(value: number | string | null | undefined, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(Number(value ?? 0));
}

export default async function SystemOwnerPage() {
  const admin = createAdminClient();
  const [businessResult, subscriptionResult, planResult, paymentResult, orderResult, branchResult] = await Promise.all([
    admin.from("businesses").select("id,name,slug,status,created_at").order("created_at", { ascending: false }),
    admin.from("business_subscriptions").select("id,business_id,plan_id,status,started_at,expires_at,billing_price_monthly,billing_currency,custom_monthly_price,override_expires_at"),
    admin.from("plans").select("id,name,price_monthly,currency,max_branches,max_active_queues_per_branch,is_active,sort_order").order("sort_order"),
    admin.from("payments").select("id,business_id,amount,currency,provider,status,payment_method,paid_at,created_at").order("created_at", { ascending: false }).limit(25),
    admin.from("subscription_orders").select("id,business_id,plan_id,amount,currency,payment_mode,provider,status,created_at").order("created_at", { ascending: false }).limit(25),
    admin.from("branches").select("id,business_id,status"),
  ]);

  const businesses = businessResult.data ?? [];
  const subscriptions = subscriptionResult.data ?? [];
  const plans = planResult.data ?? [];
  const payments = paymentResult.data ?? [];
  const orders = orderResult.data ?? [];
  const branches = branchResult.data ?? [];

  const paid = payments.filter((payment) => payment.status === "paid");
  const revenue = paid.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const subByBusiness = new Map(subscriptions.map((subscription) => [subscription.business_id, subscription]));
  const branchCounts = new Map<string, number>();
  branches.forEach((branch) => branchCounts.set(branch.business_id, (branchCounts.get(branch.business_id) ?? 0) + 1));

  return (
    <section className="system-content">
      <div className="system-hero">
        <div><p className="eyebrow">System owner</p><h1>QueueDrop control center</h1><p className="muted">Monitor clients, subscriptions, payments, plans, and platform activity.</p></div>
        <span className="env-badge">SYSTEM OWNER</span>
      </div>

      <div className="system-kpi-grid">
        <article><span>Total clients</span><strong>{businesses.length}</strong></article>
        <article><span>Active subscriptions</span><strong>{subscriptions.filter((subscription) => ["active", "trialing"].includes(subscription.status)).length}</strong></article>
        <article><span>Recorded paid revenue</span><strong>{money(revenue)}</strong></article>
        <article><span>Pending checkouts</span><strong>{orders.filter((order) => ["pending", "checkout_created"].includes(order.status)).length}</strong></article>
      </div>

      <section className="system-panel">
        <div className="system-panel-title"><div><p className="eyebrow">Clients</p><h2>Businesses</h2></div><span>{businesses.length} total</span></div>
        <div className="system-table-wrap">
          <table className="system-table">
            <thead><tr><th>Client</th><th>Status</th><th>Branches</th><th>Plan</th><th>Effective price</th><th>Subscription</th><th>Manage</th></tr></thead>
            <tbody>{businesses.map((business) => {
              const subscription = subByBusiness.get(business.id);
              const plan = subscription ? planById.get(subscription.plan_id) : null;
              const overrideActive = Boolean(subscription?.custom_monthly_price !== null && subscription?.custom_monthly_price !== undefined && (!subscription.override_expires_at || new Date(subscription.override_expires_at) > new Date()));
              const effectivePrice = overrideActive ? subscription?.custom_monthly_price : subscription?.billing_price_monthly ?? plan?.price_monthly;
              const currency = subscription?.billing_currency ?? plan?.currency ?? "PHP";
              return (
                <tr key={business.id}>
                  <td><strong>{business.name}</strong><small>{business.slug}</small></td>
                  <td>{business.status}</td>
                  <td>{branchCounts.get(business.id) ?? 0}</td>
                  <td>{plan?.name ?? "No plan"}</td>
                  <td>{effectivePrice !== null && effectivePrice !== undefined ? money(effectivePrice, currency) : "-"}{overrideActive ? <small>Custom override</small> : null}</td>
                  <td>{subscription?.status ?? "Not subscribed"}</td>
                  <td><Link className="button button-secondary button-small" href={`/system/clients/${business.id}`}>Configure</Link></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </section>

      <div className="system-two-col">
        <section className="system-panel">
          <div className="system-panel-title"><div><p className="eyebrow">Plans</p><h2>Subscription catalog</h2></div><Link href="/system/plans">Manage plans</Link></div>
          {plans.filter((plan) => plan.is_active).map((plan) => <article className="system-list-row" key={plan.id}><div><strong>{plan.name}</strong><span>{plan.max_branches ? `Up to ${plan.max_branches} branches` : "Custom branches"} · {plan.max_active_queues_per_branch ? `${plan.max_active_queues_per_branch} active queues/branch` : "Custom queues"}</span></div><b>{money(plan.price_monthly, plan.currency)}/mo</b></article>)}
        </section>
        <section className="system-panel">
          <div className="system-panel-title"><div><p className="eyebrow">Payments</p><h2>Recent transactions</h2></div></div>
          {payments.length ? payments.map((payment) => <article className="system-list-row" key={payment.id}><div><strong>{money(payment.amount, payment.currency)}</strong><span>{payment.provider} / {payment.payment_method ?? "online"}</span></div><b>{payment.status}</b></article>) : <p className="muted">No recorded payments yet.</p>}
        </section>
      </div>
    </section>
  );
}
