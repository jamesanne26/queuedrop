import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/app/dashboard/_components/sidebar";
import { createClient } from "@/lib/supabase/server";

type Props = { searchParams: Promise<{ branch?: string }> };

export default async function QueuesPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/auth/login?next=%2Fdashboard%2Fqueues");

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, role, businesses(name, slug)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");
  const business = Array.isArray(membership.businesses) ? membership.businesses[0] : membership.businesses;

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, slug, status")
    .eq("business_id", membership.business_id)
    .order("created_at", { ascending: true });

  const selectedBranchId = params.branch && (branches ?? []).some((branch) => branch.id === params.branch)
    ? params.branch
    : branches?.[0]?.id;
  const selectedBranch = (branches ?? []).find((branch) => branch.id === selectedBranchId);

  const { data: tickets } = selectedBranchId
    ? await supabase
        .from("tickets")
        .select("id, display_number, status, joined_at, customers(name, phone), services(name)")
        .eq("branch_id", selectedBranchId)
        .order("joined_at", { ascending: true })
        .limit(100)
    : { data: [] };

  return (
    <main className="dashboard-shell">
      <DashboardSidebar active="queues" />
      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Live queue</p>
            <h1>{business?.name ?? "QueueDrop"}</h1>
            <p className="muted page-lead">Milestone 4 reads customer-created tickets in real time. Staff queue actions come next.</p>
          </div>
          <span className="env-badge">DEV</span>
        </header>

        <section className="dashboard-section dashboard-section-stack management-list-card">
          <div className="section-row">
            <div>
              <p className="eyebrow">Branch</p>
              <h2>{selectedBranch?.name ?? "No branch"}</h2>
            </div>
            {business && selectedBranch ? (
              <Link className="button button-secondary button-small" href={`/q/${business.slug}/${selectedBranch.slug}`} target="_blank">
                Open customer join page ↗
              </Link>
            ) : null}
          </div>

          <div className="queue-branch-tabs">
            {(branches ?? []).map((branch) => (
              <Link key={branch.id} className={`queue-tab ${branch.id === selectedBranchId ? "queue-tab-active" : ""}`} href={`/dashboard/queues?branch=${branch.id}`}>
                {branch.name}
              </Link>
            ))}
          </div>

          {(tickets ?? []).length ? (
            <div className="queue-ticket-list">
              {(tickets ?? []).map((ticket) => {
                const customer = Array.isArray(ticket.customers) ? ticket.customers[0] : ticket.customers;
                const service = Array.isArray(ticket.services) ? ticket.services[0] : ticket.services;
                return (
                  <article className="queue-ticket-row" key={ticket.id}>
                    <div className="queue-ticket-number">{ticket.display_number}</div>
                    <div className="queue-ticket-main">
                      <strong>{customer?.name ?? "Customer"}</strong>
                      <span>{service?.name ?? "Service"} · {customer?.phone ?? "No phone"}</span>
                    </div>
                    <span className={`ticket-status-chip ticket-status-${ticket.status}`}>{ticket.status.replace("_", " ")}</span>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mini-empty">
              <strong>No queue tickets yet.</strong>
              <span>Open the customer join page and create the first DEV ticket.</span>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
