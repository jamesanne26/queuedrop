import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/app/dashboard/_components/sidebar";
import { signOut } from "@/app/auth/actions";
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
    supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", user.id)
      .maybeSingle(),
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

      allowedBranchIds = (assignments ?? []).map(
        (assignment) => assignment.branch_id,
      );
    }

    if (businessWide || (allowedBranchIds?.length ?? 0) > 0) {
      let query = supabase
        .from("branches")
        .select("id, name, slug, status, address, phone")
        .eq("business_id", primaryMembership.business_id)
        .order("created_at", { ascending: true });

      if (!businessWide && allowedBranchIds) {
        query = query.in("id", allowedBranchIds);
      }

      const { data } = await query;
      branches = data ?? [];
    }
  }

  // Staff gets a deliberately simple operational launch page:
  // branch identity, one route to Live Queue, and logout.
  if (role === "staff" && primaryMembership) {
    const staffBranch = branches[0];

    return (
      <main className="staff-launch-shell">
        <section className="staff-launch-card">
          <Link href="/" className="brand-mark">
            QueueDrop
          </Link>

          <div className="staff-launch-copy">
            <p className="eyebrow">Staff workspace</p>
            <h1>Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}</h1>

            <div className="staff-branch-card">
              <span>Branch</span>
              <strong>{staffBranch?.name ?? "No branch assigned"}</strong>
              {staffBranch?.address ? <small>{staffBranch.address}</small> : null}
            </div>
          </div>

          <div className="staff-launch-actions">
            {staffBranch ? (
              <Link
                href={`/dashboard/queues?branch=${staffBranch.id}`}
                className="button button-primary staff-launch-primary"
              >
                Go to Queues Live Page
              </Link>
            ) : (
              <div className="notice notice-error">
                No branch is assigned to this staff account.
              </div>
            )}

            <form action={signOut}>
              <button className="button button-secondary" type="submit">
                Logout
              </button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  const branchIds = branches.map((branch) => branch.id);
  const { count: serviceCount } = branchIds.length
    ? await supabase
        .from("services")
        .select("id", { count: "exact", head: true })
        .in("branch_id", branchIds)
    : { count: 0 };

  return (
    <main className="dashboard-shell">
      <DashboardSidebar active="overview" />
      <section className="dashboard-content" id="overview">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">QueueDrop workspace</p>
            <h1>Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}</h1>
          </div>
          <span className="env-badge">DEV</span>
        </header>

        {params.message ? (
          <div className="notice notice-success dashboard-notice">
            {params.message}
          </div>
        ) : null}

        {!hasWorkspace ? (
          <section className="empty-state">
            <div className="empty-icon">Q</div>
            <h2>Your account is ready</h2>
            <p>
              Create your first business workspace. QueueDrop will securely
              create your owner access, first branch, branch membership, and
              default queue configuration together.
            </p>
            <div className="empty-actions">
              <Link href="/onboarding" className="button button-primary">
                Create business
              </Link>
              <Link href="/" className="text-link">
                View public site
              </Link>
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
                <p className="stat-label">
                  {businessWide ? "Branches" : "Assigned branches"}
                </p>
                <div className="metric-number">{branches.length}</div>
                <Link className="text-link stat-link" href="/dashboard/branches">
                  {businessWide ? "Manage locations" : "View assignment"}
                </Link>
              </article>

              <article className="stat-card">
                <p className="stat-label">Services</p>
                <div className="metric-number">{serviceCount ?? 0}</div>
                <Link className="text-link stat-link" href="/dashboard/services">
                  {businessWide ? "Manage services" : "View services"}
                </Link>
              </article>

              <article className="stat-card">
                <p className="stat-label">Business status</p>
                <div className="metric-status">
                  {primaryBusiness?.status ?? "active"}
                </div>
                <p className="muted">Workspace availability</p>
              </article>
            </div>

            <section
              className="dashboard-section dashboard-section-stack"
              id="branches"
            >
              <div className="section-row">
                <div>
                  <p className="eyebrow">Workspace access</p>
                  <h2>
                    {businessWide
                      ? "Manage your business"
                      : "Your assigned branch workspace"}
                  </h2>
                </div>
              </div>

              <div className="quick-actions">
                <Link href="/dashboard/branches" className="quick-action-card">
                  <strong>{businessWide ? "Branches" : "My branch"}</strong>
                  <span>
                    {businessWide
                      ? "Add locations and review queue defaults."
                      : "View only branch locations assigned to you."}
                  </span>
                  <b>Open →</b>
                </Link>

                <Link href="/dashboard/services" className="quick-action-card">
                  <strong>Services</strong>
                  <span>
                    {businessWide
                      ? "Create queue categories, prefixes, and ETA settings."
                      : "View services for your assigned branch."}
                  </span>
                  <b>Open →</b>
                </Link>
              </div>

              <div className="quick-actions quick-actions-single">
                <Link href="/dashboard/queues" className="quick-action-card">
                  <strong>Live queue</strong>
                  <span>
                    {businessWide
                      ? "Operate queues across your business branches."
                      : "Operate queues only for your assigned branch."}
                  </span>
                  <b>Open queues →</b>
                </Link>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
