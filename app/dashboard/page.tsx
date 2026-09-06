import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardResultModal } from "@/app/dashboard/_components/dashboard-result-modal";
import { PreserveDashboardScroll } from "@/app/dashboard/_components/preserve-dashboard-scroll";
import { createClient } from "@/lib/supabase/server";

type Props = { searchParams: Promise<{ message?: string }> };

type Role = "owner" | "admin" | "manager" | "staff";

export default async function DashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/auth/login");

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
    supabase
      .from("business_users")
      .select("role, business_id, businesses(name, slug, status)")
      .eq("user_id", user.id),
  ]);

  const hasWorkspace = Boolean(memberships?.length);
  const primaryMembership = memberships?.[0];
  const role = primaryMembership?.role as Role | undefined;
  const businessWide = role === "owner" || role === "admin";
  const primaryBusiness = primaryMembership
    ? Array.isArray(primaryMembership.businesses)
      ? primaryMembership.businesses[0]
      : primaryMembership.businesses
    : null;

  let branches: {
    id: string;
    name: string;
    slug: string;
    status: string;
    address: string | null;
    phone: string | null;
  }[] = [];

  if (primaryMembership) {
    let allowedBranchIds: string[] | null = null;

    if (!businessWide) {
      const { data: assignments } = await supabase
        .from("branch_users")
        .select("branch_id")
        .eq("user_id", user.id);
      allowedBranchIds = (assignments ?? []).map((assignment) => assignment.branch_id);
    }

    if (businessWide || (allowedBranchIds?.length ?? 0) > 0) {
      let query = supabase
        .from("branches")
        .select("id, name, slug, status, address, phone")
        .eq("business_id", primaryMembership.business_id)
        .order("created_at", { ascending: true });

      if (!businessWide && allowedBranchIds) query = query.in("id", allowedBranchIds);
      const { data } = await query;
      branches = data ?? [];
    }
  }

  const branchIds = branches.map((branch) => branch.id);
  const { count: serviceCount } = branchIds.length
    ? await supabase.from("services").select("id", { count: "exact", head: true }).in("branch_id", branchIds)
    : { count: 0 };

  return (
    <>
      <PreserveDashboardScroll />
      <DashboardResultModal success={params.message} />
      <section className="dashboard-content" id="overview">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">QueueDrop workspace</p>
            <h1>Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}</h1>
          </div>
          <span className="env-badge">TEST</span>
        </header>

        {!hasWorkspace ? (
          <section className="empty-state">
            <div className="empty-icon">Q</div>
            <h2>Your account is ready</h2>
            <p>Create your first business workspace. QueueDrop will securely create your owner access, first branch, branch membership, and default queue configuration together.</p>
            <div className="empty-actions">
              <Link href="/onboarding" className="button button-primary">Create business</Link>
              <Link href="/" className="text-link">View public site</Link>
            </div>
          </section>
        ) : (
          <>
            <div className="workspace-summary workspace-summary-four">
              <article className="stat-card stat-card-wide">
                <p className="stat-label">Active workspace</p>
                <h2>{primaryBusiness?.name ?? "QueueDrop business"}</h2>
                <p className="muted">Your role: {role}</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">{businessWide ? "Branches" : "Assigned branches"}</p>
                <div className="metric-number">{branches.length}</div>
                <Link className="text-link stat-link" href="/dashboard/branches">{businessWide ? "Manage locations" : "View assignment"}</Link>
              </article>
              <article className="stat-card">
                <p className="stat-label">Services</p>
                <div className="metric-number">{serviceCount ?? 0}</div>
                <Link className="text-link stat-link" href="/dashboard/services">{businessWide ? "Manage services" : "View services"}</Link>
              </article>
              <article className="stat-card">
                <p className="stat-label">Business status</p>
                <div className="metric-status">{primaryBusiness?.status ?? "active"}</div>
                <p className="muted">Workspace availability</p>
              </article>
            </div>

            <section className="dashboard-section dashboard-section-stack" id="branches">
              <div className="section-row">
                <div><p className="eyebrow">Workspace access</p><h2>{businessWide ? "Manage your business" : "Your assigned branch workspace"}</h2></div>
                <span className="coming-badge">Milestone 5</span>
              </div>
              <div className="quick-actions">
                <Link href="/dashboard/branches" className="quick-action-card"><strong>{businessWide ? "Branches" : "My branch"}</strong><span>{businessWide ? "Add locations and review queue defaults." : "View only the branch locations assigned to you."}</span><b>Open →</b></Link>
                <Link href="/dashboard/services" className="quick-action-card"><strong>Services</strong><span>{businessWide ? "Create queue categories, prefixes, and ETA settings." : "View services for your assigned branch."}</span><b>Open →</b></Link>
              </div>
              <div className="quick-actions quick-actions-single">
                <Link href="/dashboard/queues" className="quick-action-card"><strong>Live queue</strong><span>{businessWide ? "Operate queues across your business branches." : "Operate queues only for your assigned branch."}</span><b>Open queues →</b></Link>
              </div>
            </section>
          </>
        )}

        <section className="dashboard-section" id="queues">
          <div><p className="eyebrow">Access model</p><h2>{hasWorkspace ? "Role-aware workspace online" : "Environment connected"}</h2></div>
          <div className="status-list">
            <div><span className="status-dot" />Supabase SSR authentication</div>
            <div><span className="status-dot" />RLS-protected database</div>
            <div><span className="status-dot" />Atomic owner onboarding</div>
            <div><span className="status-dot" />Branch-scoped staff access</div>
            <div><span className="status-dot" />Terminal-issued anonymous stub queue</div>
          </div>
        </section>
      </section>
    </>
  );
}
