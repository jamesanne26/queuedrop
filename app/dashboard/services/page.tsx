import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/app/dashboard/_components/sidebar";
import { createClient } from "@/lib/supabase/server";
import { createService, setServiceActive } from "./actions";

type Props = { searchParams: Promise<{ message?: string; error?: string }> };

export default async function ServicesPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/auth/login?next=%2Fdashboard%2Fservices");

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, role, businesses(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/onboarding");

  const business = Array.isArray(membership.businesses) ? membership.businesses[0] : membership.businesses;
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, status")
    .eq("business_id", membership.business_id)
    .order("created_at", { ascending: true });

  const branchIds = (branches ?? []).map((branch) => branch.id);
  const { data: services } = branchIds.length
    ? await supabase
        .from("services")
        .select("id, branch_id, name, description, queue_prefix, estimated_minutes, is_active, created_at")
        .in("branch_id", branchIds)
        .order("created_at", { ascending: true })
    : { data: [] };

  const branchById = new Map((branches ?? []).map((branch) => [branch.id, branch]));
  const canManage = membership.role === "owner" || membership.role === "admin";

  return (
    <main className="dashboard-shell">
      <DashboardSidebar active="services" />
      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Service management</p>
            <h1>{business?.name ?? "QueueDrop"}</h1>
            <p className="muted page-lead">Services are branch-specific and will become the categories customers choose before joining a queue.</p>
          </div>
          <span className="env-badge">DEV</span>
        </header>

        {params.message ? <div className="notice notice-success">{params.message}</div> : null}
        {params.error ? <div className="notice notice-error">{params.error}</div> : null}

        <div className="management-grid">
          <section className="dashboard-section dashboard-section-stack management-list-card">
            <div className="section-row"><div><p className="eyebrow">Configured services</p><h2>{services?.length ?? 0} total</h2></div></div>
            {(services ?? []).length ? (
              <div className="service-list">
                {(services ?? []).map((service) => {
                  const branch = branchById.get(service.branch_id);
                  return (
                    <article className="service-row" key={service.id}>
                      <div className="service-main">
                        <div className="service-title-row">
                          <strong>{service.name}</strong>
                          <span className={service.is_active ? "status-chip" : "status-chip status-chip-off"}>{service.is_active ? "active" : "inactive"}</span>
                        </div>
                        <span>{branch?.name ?? "Unknown branch"} · Prefix {service.queue_prefix || "branch default"} · {service.estimated_minutes ? `${service.estimated_minutes} min` : "No ETA set"}</span>
                        {service.description ? <p>{service.description}</p> : null}
                      </div>
                      {canManage ? (
                        <form action={setServiceActive}>
                          <input type="hidden" name="service_id" value={service.id} />
                          <input type="hidden" name="next_active" value={service.is_active ? "false" : "true"} />
                          <button className="button button-secondary button-small" type="submit">{service.is_active ? "Deactivate" : "Activate"}</button>
                        </form>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : <div className="mini-empty"><strong>No services yet</strong><span>Create the first queue category for a branch.</span></div>}
          </section>

          {canManage ? (
            <section className="dashboard-section dashboard-section-stack management-form-card">
              <div><p className="eyebrow">Add queue category</p><h2>Create service</h2></div>
              <form action={createService} className="form-stack management-form">
                <label>Branch
                  <select name="branch_id" required defaultValue="">
                    <option value="" disabled>Select branch</option>
                    {(branches ?? []).filter((branch) => branch.status === "active").map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}
                  </select>
                </label>
                <label>Service name<input name="name" required minLength={2} maxLength={120} placeholder="e.g. Haircut" /></label>
                <label>Description <em>optional</em><textarea name="description" maxLength={500} placeholder="What this queue is for" /></label>
                <div className="form-split">
                  <label>Queue prefix <em>optional</em><input name="queue_prefix" maxLength={6} placeholder="HC" /></label>
                  <label>Estimated minutes <em>optional</em><input name="estimated_minutes" type="number" min={1} max={480} step={1} placeholder="30" /></label>
                </div>
                <button className="button button-primary" type="submit" disabled={!branches?.length}>Create service</button>
              </form>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
