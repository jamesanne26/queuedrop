import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardResultModal } from "@/app/dashboard/_components/dashboard-result-modal";
import { DigitsOnlyInput } from "@/app/_components/digits-only-input";
import { updateOwnAccount } from "./actions";

type Props = { searchParams: Promise<{ message?: string; error?: string }> };

export default async function AccountPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) redirect("/auth/login?next=%2Fdashboard%2Faccount");

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from("profiles").select("full_name,email,phone").eq("id", user.id).maybeSingle(),
    supabase.from("business_users").select("role,can_manage_roles,businesses(name)").eq("user_id", user.id).eq("is_active", true).limit(1).maybeSingle(),
  ]);

  const business = membership ? (Array.isArray(membership.businesses) ? membership.businesses[0] : membership.businesses) : null;
  const fullName = profile?.full_name || String(user.user_metadata?.full_name ?? "") || user.email || "QueueDrop user";
  const email = profile?.email || user.email || "";

  return (
    <>
      <DashboardResultModal success={params.message} error={params.error} />
      <section className="dashboard-content account-page-v2">
        <header className="dashboard-header account-page-header-v2">
          <div><p className="eyebrow">Account</p><h1>My Account</h1><p className="muted">Update your personal QueueDrop profile without entering Settings.</p></div>
        </header>

        <div className="account-page-grid-v2">
          <section className="dashboard-section dashboard-section-stack account-profile-card-v2">
            <div className="account-profile-heading-v2">
              <div className="account-profile-avatar-v2">{fullName.slice(0, 1).toUpperCase()}</div>
              <div><h2>{fullName}</h2><p>{email || "No email"}</p><span>{membership?.role ?? "user"}{business?.name ? ` · ${business.name}` : ""}</span></div>
            </div>

            <form action={updateOwnAccount} className="form-stack account-edit-form-v2">
              <label>Full name<input name="full_name" required minLength={2} maxLength={100} defaultValue={fullName} /></label>
              <label>Email<input value={email} readOnly aria-readonly="true" /><small className="muted">Login email is protected here. Contact an administrator if it must be changed.</small></label>
              <label>Mobile number<DigitsOnlyInput name="phone" maxLength={20} defaultValue={profile?.phone ?? ""} placeholder="09XXXXXXXXX" /></label>
              <div className="account-password-section">
                <div><strong>Change password</strong><small className="muted">Leave blank to keep your current password.</small></div>
                <label>New password<input name="new_password" type="password" minLength={6} maxLength={72} autoComplete="new-password" placeholder="At least 6 characters" /></label>
                <label>Confirm password<input name="confirm_password" type="password" minLength={6} maxLength={72} autoComplete="new-password" placeholder="Repeat new password" /></label>
              </div>
              <div className="account-edit-summary-v2"><span>Role</span><strong>{membership?.role ?? "user"}</strong></div>
              <div className="account-edit-summary-v2"><span>Business</span><strong>{business?.name ?? "QueueDrop"}</strong></div>
              {membership?.can_manage_roles || membership?.role === "owner" || membership?.role === "admin" ? <div className="account-permission-access"><strong>Permissions</strong><span>Your role can manage role permissions.</span><a className="button button-secondary" href="/dashboard/settings?view=permissions">Open Permissions</a></div> : null}
              <button className="button button-primary" type="submit">Save account & password</button>
            </form>
          </section>
        </div>
      </section>
    </>
  );
}
