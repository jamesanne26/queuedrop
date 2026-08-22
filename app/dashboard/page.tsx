import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
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

        {!hasWorkspace ? (
          <section className="empty-state">
            <div className="empty-icon">Q</div>
            <h2>Your account is ready</h2>
            <p>
              No business workspace is attached yet. The next development milestone will add the secure owner onboarding transaction that creates the business, first branch, owner membership, and queue defaults atomically.
            </p>
            <div className="empty-actions">
              <span className="button button-disabled">Create business — next milestone</span>
              <Link href="/" className="text-link">View public site</Link>
            </div>
          </section>
        ) : (
          <div className="card-grid">
            {memberships?.map((membership) => {
              const business = Array.isArray(membership.businesses)
                ? membership.businesses[0]
                : membership.businesses;
              return (
                <article className="stat-card" key={`${membership.business_id}-${membership.role}`}>
                  <p className="stat-label">Business</p>
                  <h2>{business?.name ?? "QueueDrop business"}</h2>
                  <p className="muted">Role: {membership.role}</p>
                </article>
              );
            })}
          </div>
        )}

        <section className="dashboard-section" id="queues">
          <div>
            <p className="eyebrow">System foundation</p>
            <h2>Environment connected</h2>
          </div>
          <div className="status-list">
            <div><span className="status-dot" />Next.js application</div>
            <div><span className="status-dot" />Supabase SSR authentication</div>
            <div><span className="status-dot" />RLS-protected database</div>
            <div><span className="status-dot" />Migration-based database rebuild</div>
          </div>
        </section>
      </section>
    </main>
  );
}
