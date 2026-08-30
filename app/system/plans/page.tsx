import { createAdminClient } from "@/lib/supabase/admin";
import { savePlan } from "./actions";
import { DeletePlanButton } from "./delete-plan-button";

type Props = { searchParams: Promise<{ message?: string; error?: string }> };

function money(value: number | string | null | undefined, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

export default async function SystemPlansPage({ searchParams }: Props) {
  const query = await searchParams;
  const admin = createAdminClient();
  const { data: plans } = await admin
    .from("plans")
    .select("id,name,description,price_monthly,price_yearly,currency,min_branches,max_branches,max_active_queues_per_branch,max_services_per_branch,trial_days,is_active,is_public,accepts_new_subscriptions,sort_order")
    .order("sort_order")
    .order("name");

  return (
    <section className="system-content">
      <div className="system-hero">
        <div><p className="eyebrow">System owner</p><h1>Plan management</h1><p className="muted">Prices and limits are database-driven. Change them here without redeploying QueueDrop.</p></div>
      </div>
      {query.message ? <div className="notice notice-success">{query.message}</div> : null}
      {query.error ? <div className="notice notice-error">{query.error}</div> : null}

      <section className="system-panel">
        <div className="system-panel-title"><div><p className="eyebrow">New plan</p><h2>Create a plan</h2></div></div>
        <PlanForm />
      </section>

      <div className="system-plan-stack">
        {(plans ?? []).map((plan) => (
          <section className="system-panel" key={plan.id}>
            <div className="system-panel-title">
              <div><p className="eyebrow">{plan.is_public ? "Public plan" : "Private plan"}</p><h2>{plan.name}</h2></div>
              <strong>{money(plan.price_monthly, plan.currency)}/mo</strong>
            </div>
            <PlanForm plan={plan} />
            <div className="system-plan-delete-row"><DeletePlanButton planId={plan.id} planName={plan.name} /></div>
          </section>
        ))}
      </div>
    </section>
  );
}

type Plan = {
  id: string; name: string; description: string | null; price_monthly: number | string; price_yearly: number | string | null;
  currency: string; min_branches: number; max_branches: number | null; max_active_queues_per_branch: number | null;
  max_services_per_branch: number | null; trial_days: number; is_active: boolean; is_public: boolean;
  accepts_new_subscriptions: boolean; sort_order: number;
};

function PlanForm({ plan }: { plan?: Plan }) {
  return (
    <form action={savePlan} className="system-form-grid">
      {plan ? <input type="hidden" name="plan_id" value={plan.id} /> : null}
      <label>Plan name<input name="name" defaultValue={plan?.name ?? ""} required maxLength={80} /></label>
      <label>Currency<input name="currency" defaultValue={plan?.currency ?? "PHP"} required maxLength={3} /></label>
      <label>Monthly price<input name="price_monthly" type="number" min="0" step="0.01" defaultValue={plan?.price_monthly ?? ""} required /></label>
      <label>Annual price <span className="muted">(blank = not offered)</span><input name="price_yearly" type="number" min="0" step="0.01" defaultValue={plan?.price_yearly ?? ""} /></label>
      <label>Minimum branches<input name="min_branches" type="number" min="0" step="1" defaultValue={plan?.min_branches ?? 1} required /></label>
      <label>Maximum branches <span className="muted">(blank = unlimited/custom)</span><input name="max_branches" type="number" min="1" step="1" defaultValue={plan?.max_branches ?? ""} /></label>
      <label>Active queues / branch <span className="muted">(blank = unlimited)</span><input name="max_active_queues_per_branch" type="number" min="1" step="1" defaultValue={plan?.max_active_queues_per_branch ?? ""} /></label>
      <label>Total services / branch <span className="muted">(blank = unlimited)</span><input name="max_services_per_branch" type="number" min="1" step="1" defaultValue={plan?.max_services_per_branch ?? ""} /></label>
      <label>Trial days<input name="trial_days" type="number" min="0" step="1" defaultValue={plan?.trial_days ?? 14} /></label>
      <label>Display order<input name="sort_order" type="number" min="0" step="1" defaultValue={plan?.sort_order ?? 0} /></label>
      <label className="system-form-wide">Description<textarea name="description" rows={3} defaultValue={plan?.description ?? ""} /></label>
      <div className="system-form-wide system-toggle-row">
        <label><input type="checkbox" name="is_active" defaultChecked={plan?.is_active ?? true} /> Active</label>
        <label><input type="checkbox" name="is_public" defaultChecked={plan?.is_public ?? true} /> Show on public pricing</label>
        <label><input type="checkbox" name="accepts_new_subscriptions" defaultChecked={plan?.accepts_new_subscriptions ?? true} /> Accept new subscriptions</label>
        {plan ? <label><input type="checkbox" name="apply_existing_price" /> Apply new monthly price to existing active subscribers</label> : null}
      </div>
      <div className="system-form-wide system-plan-form-actions"><button className="button button-primary" type="submit">{plan ? "Save plan changes" : "Create plan"}</button></div>
    </form>
  );
}
