import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

function branchLabel(min: number | null, max: number | null) {
  if (max === null) return `${min ?? 1}+ branches / custom`;
  if (max === 1) return "1 branch";
  return `Up to ${max} branches`;
}

export default async function PricingPage() {
  const admin = createAdminClient();
  const { data: plans } = await admin
    .from("plans")
    .select("id,name,description,min_branches,max_branches,price_monthly,price_yearly,currency,max_active_queues_per_branch,max_services_per_branch,trial_days")
    .eq("is_active", true)
    .eq("is_public", true)
    .eq("accepts_new_subscriptions", true)
    .order("sort_order");

  return (
    <main className="pricing-shell">
      <nav className="topbar"><Link href="/" className="brand-mark">QueueDrop</Link><div className="topbar-actions"><Link href="/auth/login" className="button button-secondary">Sign in</Link><Link href="/auth/signup" className="button button-primary">Get started</Link></div></nav>
      <section className="pricing-hero"><p className="eyebrow">Simple monthly plans</p><h1>Choose the QueueDrop plan for your locations.</h1><p>No customer app download. Upgrade as your business grows.</p></section>
      <section className="pricing-grid">{(plans ?? []).map((plan) => (
        <article className="pricing-card" key={plan.id}>
          <p className="eyebrow">{branchLabel(plan.min_branches, plan.max_branches)}</p>
          <h2>{plan.name}</h2>
          <div className="pricing-price">₱{Number(plan.price_monthly).toLocaleString()}<span>/month</span></div>
          {plan.price_yearly ? <p className="pricing-annual">₱{Number(plan.price_yearly).toLocaleString()}/year</p> : null}
          <p>{plan.description}</p>
          <ul>
            <li>{plan.max_active_queues_per_branch ? `Up to ${plan.max_active_queues_per_branch} active queues` : "Custom active queue allowance"}</li>
            <li>{plan.trial_days > 0 ? `${plan.trial_days}-day trial` : "No trial"}</li>
            <li>Live queue + customer browser tracking</li>
          </ul>
          <Link href="/auth/signup" className="button button-primary">Subscribe</Link>
        </article>
      ))}</section>
    </main>
  );
}
