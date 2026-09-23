import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createFirstService, skipFirstService } from "../service-actions";
import { PendingSubmitButton } from "@/app/dashboard/_components/pending-submit-button";

type Props = { searchParams: Promise<{ branch?: string; error?: string }> };

export default async function FirstServicePage({ searchParams }: Props) {
  const { branch: branchId, error } = await searchParams;
  if (!branchId) redirect("/dashboard");
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/login?next=%2Fonboarding%2Fservice");

  const { data: branch } = await supabase.from("branches").select("id,name,business_id").eq("id", branchId).maybeSingle();
  if (!branch) redirect("/dashboard");
  const { data: membership } = await supabase.from("business_users").select("role").eq("business_id", branch.business_id).eq("user_id", userData.user.id).eq("is_active", true).maybeSingle();
  if (!membership || !["owner","admin"].includes(membership.role)) redirect("/dashboard");

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card">
        <div className="onboarding-heading">
          <p className="eyebrow">Workspace setup · Step 2 of 2</p>
          <h1>Add your first service</h1>
          <p>Your first branch <strong>{branch.name}</strong> is saved. Add the first service customers will queue for.</p>
        </div>
        {error ? <div className="notice notice-error">{error}</div> : null}
        <form action={createFirstService} className="form-stack onboarding-form" data-no-global-loading="true">
          <input type="hidden" name="branch_id" value={branch.id} />
          <label>Service name<input name="name" required minLength={2} maxLength={120} placeholder="e.g. Haircut" autoFocus /></label>
          <label>Group <em>Optional</em><input name="service_group" maxLength={80} placeholder="e.g. Salon" /></label>
          <label>Description <em>Optional</em><textarea name="description" maxLength={500} placeholder="Short description" /></label>
          <div className="settings-catalog-split">
            <label>Queue prefix <em>Optional</em><input name="queue_prefix" maxLength={6} placeholder="HC" /></label>
            <label>Estimated minutes <em>Optional</em><input name="estimated_minutes" type="number" min={1} max={480} placeholder="30" /></label>
          </div>
          <PendingSubmitButton idle="Save first service" pending="Saving service…" className="button button-primary button-large" />
        </form>
        <form action={skipFirstService} data-no-global-loading="true">
          <input type="hidden" name="branch_id" value={branch.id} />
          <button type="submit" className="text-link">Skip for now</button>
        </form>
      </section>
    </main>
  );
}
