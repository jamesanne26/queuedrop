import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveClientOverrides, saveCustomerMoveDownVisibility } from "./actions";

type Props = { params: Promise<{ businessId: string }>; searchParams: Promise<{ message?: string; error?: string }> };

function nullableDate(value: string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

export default async function SystemClientDetailPage({ params, searchParams }: Props) {
  const { businessId } = await params;
  const query = await searchParams;
  const admin = createAdminClient();
  const [{ data: business }, { data: subscription }, { data: plans }, { count: branchCount }] = await Promise.all([
    admin.from("businesses").select("id,name,slug,status,created_at").eq("id", businessId).maybeSingle(),
    admin.from("business_subscriptions").select("id,plan_id,status,billing_price_monthly,billing_currency,custom_monthly_price,custom_max_branches,custom_max_active_queues_per_branch,custom_max_services_per_branch,custom_trial_days,override_reason,override_expires_at,started_at,expires_at").eq("business_id", businessId).maybeSingle(),
    admin.from("plans").select("id,name,price_monthly,currency,max_branches,max_active_queues_per_branch,max_services_per_branch,trial_days,is_active").order("sort_order"),
    admin.from("branches").select("id", { count: "exact", head: true }).eq("business_id", businessId),
  ]);
  if (!business) notFound();

  const { data: branchSettings } = await admin
    .from("branches")
    .select("id,name,queue_configurations(customer_can_move_down)")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  const selectedPlanId = subscription?.plan_id ?? plans?.find((p) => p.is_active)?.id ?? "";
  const selectedPlan = (plans ?? []).find((p) => p.id === selectedPlanId);

  return (
    <section className="system-content">
      <div className="system-hero"><div><p className="eyebrow">Client settings</p><h1>{business.name}</h1><p className="muted">{business.slug} · {branchCount ?? 0} branch(es) · {business.status}</p></div><Link className="button button-secondary" href="/system">Back to clients</Link></div>
      {query.message ? <div className="notice notice-success">{query.message}</div> : null}
      {query.error ? <div className="notice notice-error">{query.error}</div> : null}

      <section className="system-panel">
        <div className="system-panel-title"><div><p className="eyebrow">Customer queue controls</p><h2>Move down one place</h2></div></div>
        <p className="muted">System Owner can show or hide the customer self-service move-down button per branch. Clients can also manage the same setting from Dashboard → Settings.</p>
        <div className="system-form-grid">
          {(branchSettings ?? []).map((branch) => {
            const relation = Array.isArray(branch.queue_configurations) ? branch.queue_configurations[0] : branch.queue_configurations;
            return (
              <form action={saveCustomerMoveDownVisibility} className="system-form-wide permission-card" key={branch.id}>
                <input type="hidden" name="business_id" value={business.id} />
                <input type="hidden" name="branch_id" value={branch.id} />
                <strong>{branch.name}</strong>
                <label>
                  <input type="checkbox" name="customer_can_move_down" defaultChecked={relation?.customer_can_move_down ?? false} />{" "}
                  Show “Move down 1 place” in Customer View
                </label>
                <div><button className="button button-secondary" type="submit">Save branch setting</button></div>
              </form>
            );
          })}
          {!(branchSettings ?? []).length ? <p className="muted system-form-wide">This client has no branches yet.</p> : null}
        </div>
      </section>

      <section className="system-panel">
        <div className="system-panel-title"><div><p className="eyebrow">Subscription</p><h2>Plan & client-specific overrides</h2></div><span>{subscription?.status ?? "Not subscribed"}</span></div>
        <p className="muted">Leave an override blank to inherit the selected plan. Overrides can expire automatically.</p>
        <form action={saveClientOverrides} className="system-form-grid">
          <input type="hidden" name="business_id" value={business.id} />
          <label className="system-form-wide">Plan<select name="plan_id" defaultValue={selectedPlanId} required>{(plans ?? []).map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — ₱{Number(plan.price_monthly).toLocaleString()}/mo</option>)}</select></label>
          <label>Custom monthly price<input name="custom_monthly_price" type="number" min="0" step="0.01" defaultValue={subscription?.custom_monthly_price ?? ""} placeholder={selectedPlan ? String(selectedPlan.price_monthly) : "Plan default"} /></label>
          <label>Custom branch limit<input name="custom_max_branches" type="number" min="1" step="1" defaultValue={subscription?.custom_max_branches ?? ""} placeholder={selectedPlan?.max_branches ? String(selectedPlan.max_branches) : "Unlimited"} /></label>
          <label>Custom active queues / branch<input name="custom_max_active_queues_per_branch" type="number" min="1" step="1" defaultValue={subscription?.custom_max_active_queues_per_branch ?? ""} placeholder={selectedPlan?.max_active_queues_per_branch ? String(selectedPlan.max_active_queues_per_branch) : "Unlimited"} /></label>
          <label>Custom total services / branch<input name="custom_max_services_per_branch" type="number" min="1" step="1" defaultValue={subscription?.custom_max_services_per_branch ?? ""} placeholder={selectedPlan?.max_services_per_branch ? String(selectedPlan.max_services_per_branch) : "Unlimited"} /></label>
          <label>Custom trial days<input name="custom_trial_days" type="number" min="0" step="1" defaultValue={subscription?.custom_trial_days ?? ""} placeholder={selectedPlan ? String(selectedPlan.trial_days) : "Plan default"} /></label>
          <label>Override expiry<input name="override_expires_at" type="date" defaultValue={nullableDate(subscription?.override_expires_at)} /></label>
          <label className="system-form-wide">Reason / internal note<textarea name="override_reason" rows={3} defaultValue={subscription?.override_reason ?? ""} placeholder="Early adopter, negotiated contract, partner account..." /></label>
          <div className="system-form-wide"><button className="button button-primary" type="submit">Save client settings</button></div>
        </form>
      </section>
    </section>
  );
}
