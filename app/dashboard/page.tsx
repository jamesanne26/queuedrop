import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{ message?: string }>;
};

export default async function DashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (!userId) redirect("/auth/login");

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone").eq("id", userId).maybeSingle(),
    supabase
      .from("business_users")
      .select("role, business_id, businesses(name, slug, status)")
      .eq("user_id", userId),
  ]);

  const hasWorkspace = Boolean(memberships?.length);
  const primaryMembership = memberships?.[0];
  const primaryBusiness = primaryMembership
    ? Array.isArray(primaryMembership.businesses)
      ? primaryMembership.businesses[0]
      : primaryMembership.businesses
    : null;

  const { data: branches } = primaryMembership
    ? await supabase
        .from("branches")
        .select("id, name, slug, status, address, phone")
        .eq("business_id", primaryMembership.business_id)
        .order("created_at", { ascending: true })
    : { data: [] };

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <Link href="/" className="brand-mark brand-light">QueueDrop</Link>
        <nav>
          <a className="nav-item nav-item-active" href="#overview">Overview</a>
          <a className="nav-item" href="#queues">Queues</a>
          <a className="nav-item" href="#branches">Branches</a>
          <a className="nav-item" href="#services">Services</a>
          <a className="nav-item" href="#team">Team</a>
        </nav>
        <form action={signOut} className="sidebar-footer">
          <button className="button button-ghost-light" type="submit">Sign out</button>
        </form>
      </aside>

      <section className="dashboard-content" id="overview">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">QueueDrop workspace</p>
            <h1>Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}</h1>
          </div>
          <span className="env-badge">DEV</span>
        </header>

        {params.message ? <div className="notice notice-success dashboard-notice">{params.message}</div> : null}

        {!hasWorkspace ? (
          <section className="empty-state">
            <div className="empty-icon">Q</div>
            <h2>Your account is ready</h2>
            <p>
              Create your first business workspace. QueueDrop will securely create your owner access,
              first branch, branch membership, and default queue configuration together.
            </p>
            <div className="empty-actions">
              <Link href="/onboarding" className="button button-primary">Create business</Link>
              <Link href="/" className="text-link">View public site</Link>
            </div>
          </section>
        ) : (
          <>
            <div className="workspace-summary">
              <article className="stat-card stat-card-wide">
                <p className="stat-label">Active workspace</p>
                <h2>{primaryBusiness?.name ?? "QueueDrop business"}</h2>
                <p className="muted">Your role: {primaryMembership?.role}</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">Branches</p>
                <div className="metric-number">{branches?.length ?? 0}</div>
                <p className="muted">Configured locations</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">Business status</p>
                <div className="metric-status">{primaryBusiness?.status ?? "active"}</div>
                <p className="muted">Workspace availability</p>
              </article>
            </div>

            <section className="dashboard-section dashboard-section-stack" id="branches">
              <div className="section-row">
                <div>
                  <p className="eyebrow">Branches</p>
                  <h2>Your first location is ready</h2>
                </div>
                <span className="coming-badge">Management next</span>
              </div>

              <div className="branch-list">
                {branches?.map((branch) => (
                  <article className="branch-row" key={branch.id}>
                    <div>
                      <strong>{branch.name}</strong>
                      <span>{branch.address || "No address added yet"}</span>
                    </div>
                    <div className="branch-meta">
                      <span>{branch.phone || "No contact number"}</span>
                      <span className="status-chip">{branch.status}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        <section className="dashboard-section" id="queues">
          <div>
            <p className="eyebrow">System foundation</p>
            <h2>{hasWorkspace ? "Workspace foundation complete" : "Environment connected"}</h2>
          </div>
          <div className="status-list">
            <div><span className="status-dot" />Next.js application</div>
            <div><span className="status-dot" />Supabase SSR authentication</div>
            <div><span className="status-dot" />RLS-protected database</div>
            <div><span className="status-dot" />Atomic owner onboarding</div>
          </div>
        </section>
      </section>
    </main>
  );
}
