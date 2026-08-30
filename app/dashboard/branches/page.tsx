import Link from "next/link";
import { redirect } from "next/navigation";
import { createBranch } from "./actions";
import { BranchManagementList } from "./branch-management-list";
import { DashboardResultModal } from "@/app/dashboard/_components/dashboard-result-modal";
import { PreserveDashboardScroll } from "@/app/dashboard/_components/preserve-dashboard-scroll";
import { createClient } from "@/lib/supabase/server";
import { DigitsOnlyInput } from "@/app/_components/digits-only-input";

type Props = { searchParams: Promise<{ message?: string; error?: string }> };
type Role = "owner" | "admin" | "manager" | "staff";

export default async function BranchesPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/auth/login?next=%2Fdashboard%2Fbranches");

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, role, can_set_branch_status, can_manage_operating_hours, can_manage_kiosk_display, businesses(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  const role = membership.role as Role;
  const canManage = role === "owner" || role === "admin" || Boolean(membership.can_set_branch_status || membership.can_manage_operating_hours || membership.can_manage_kiosk_display);
  const canSetStatus = canManage || Boolean(membership.can_set_branch_status);
  const business = Array.isArray(membership.businesses) ? membership.businesses[0] : membership.businesses;

  let allowedBranchIds: string[] | null = null;
  if (!canManage) {
    const { data: assignments } = await supabase
      .from("branch_users")
      .select("branch_id")
      .eq("user_id", user.id);
    allowedBranchIds = (assignments ?? []).map((assignment) => assignment.branch_id);
  }

  let branches: {
    id: string;
    name: string;
    slug: string;
    status: string;
    address: string | null;
    phone: string | null;
    created_at: string;
  }[] = [];

  if (canManage || (allowedBranchIds?.length ?? 0) > 0) {
    let query = supabase
      .from("branches")
      .select("id, name, slug, status, address, phone, created_at")
      .eq("business_id", membership.business_id)
      .order("created_at", { ascending: true });
    if (!canManage && allowedBranchIds) query = query.in("id", allowedBranchIds);
    const { data } = await query;
    branches = data ?? [];
  }

  const branchIds = branches.map((branch) => branch.id);
  const { data: configs } = branchIds.length
    ? await supabase
        .from("queue_configurations")
        .select("branch_id, ticket_prefix, starting_number, no_show_minutes, allow_qr_join, is_active")
        .in("branch_id", branchIds)
    : { data: [] };

  const configByBranch = new Map((configs ?? []).map((config) => [config.branch_id, config]));

  return (
    <>
      <PreserveDashboardScroll />
      <DashboardResultModal success={params.message} error={params.error} />
      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">{canManage ? "Branch management" : "Assigned branch"}</p>
            <h1>{business?.name ?? "QueueDrop"}</h1>
            <p className="muted page-lead">{canManage ? "Manage physical locations and the default queue settings created for each branch." : "You can only view the branch locations assigned to your staff account."}</p>
          </div>
          <span className="env-badge">TEST</span>
        </header>

        <div className="management-grid">
          <section className="dashboard-section dashboard-section-stack management-list-card">
            <div className="section-row">
              <div><p className="eyebrow">Locations</p><h2>{branches.length} branch{branches.length === 1 ? "" : "es"}</h2></div>
              <Link className="text-link" href="/dashboard/services">View services →</Link>
            </div>
            <BranchManagementList
              canManage={canManage}
              canSetStatus={canSetStatus}
              branches={branches.map((branch) => {
                const config = configByBranch.get(branch.id);
                return {
                  id: branch.id,
                  name: branch.name,
                  status: branch.status,
                  address: branch.address,
                  phone: branch.phone,
                  queueSummary: `Queue: ${config?.ticket_prefix ?? "Q"} - starts at ${config?.starting_number ?? 1} - no-show ${config?.no_show_minutes ?? 5} min`,
                };
              })}
            />
          </section>

          {canManage ? (
            <section className="dashboard-section dashboard-section-stack management-form-card">
              <div><p className="eyebrow">Add location</p><h2>Create branch</h2><p className="muted">QueueDrop automatically creates its default queue configuration and gives you branch access.</p></div>
              <form action={createBranch} className="form-stack management-form">
                <label>Branch name<input name="name" required minLength={2} maxLength={120} placeholder="e.g. Cubao Branch" /></label>
                <label>Address <em>optional</em><input name="address" maxLength={300} placeholder="Branch address" /></label>
                <label>Contact number <em>optional</em><DigitsOnlyInput name="phone" maxLength={20} placeholder="09171234567" autoComplete="tel" /></label>
                <button className="button button-primary" type="submit">Create branch</button>
              </form>
            </section>
          ) : null}
        </div>
      </section>
    </>
  );
}
