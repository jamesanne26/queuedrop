import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/app/dashboard/_components/sidebar";
import { createClient } from "@/lib/supabase/server";
import { callNextAction, updateTicketAction, updateCustomerDetailsAction } from "./actions";

type Props = {
  searchParams: Promise<{ branch?: string; success?: string; error?: string }>;
};

type Role = "owner" | "admin" | "manager" | "staff";

type ChangeRow = {
  ticket_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by_type: string;
  created_at: string;
};

type QueueTicket = {
  id: string;
  display_number: string;
  status: "waiting" | "called" | "serving" | "completed" | "cancelled" | "no_show";
  joined_at: string;
  service_id: string;
  customer_name_override: string | null;
  customer_phone_override: string | null;
  customers: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null;
  services: { id: string; name: string } | { id: string; name: string }[] | null;
};

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function TicketActions({ ticket, branchId }: { ticket: QueueTicket; branchId: string }) {
  if (ticket.status === "completed" || ticket.status === "cancelled" || ticket.status === "no_show") return null;

  return (
    <div className="queue-actions">
      {ticket.status === "called" ? (
        <>
          <form action={updateTicketAction}>
            <input type="hidden" name="branch_id" value={branchId} />
            <input type="hidden" name="ticket_id" value={ticket.id} />
            <input type="hidden" name="action" value="serve" />
            <button className="button button-primary button-small" type="submit">Start serving</button>
          </form>
          <form action={updateTicketAction}>
            <input type="hidden" name="branch_id" value={branchId} />
            <input type="hidden" name="ticket_id" value={ticket.id} />
            <input type="hidden" name="action" value="recall" />
            <button className="button button-secondary button-small" type="submit">Recall</button>
          </form>
        </>
      ) : null}

      {ticket.status === "serving" ? (
        <form action={updateTicketAction}>
          <input type="hidden" name="branch_id" value={branchId} />
          <input type="hidden" name="ticket_id" value={ticket.id} />
          <input type="hidden" name="action" value="complete" />
          <button className="button button-primary button-small" type="submit">Complete</button>
        </form>
      ) : null}

      {ticket.status === "waiting" || ticket.status === "called" ? (
        <form action={updateTicketAction}>
          <input type="hidden" name="branch_id" value={branchId} />
          <input type="hidden" name="ticket_id" value={ticket.id} />
          <input type="hidden" name="action" value="no_show" />
          <button className="button button-secondary button-small" type="submit">No-show</button>
        </form>
      ) : null}

      <form action={updateTicketAction}>
        <input type="hidden" name="branch_id" value={branchId} />
        <input type="hidden" name="ticket_id" value={ticket.id} />
        <input type="hidden" name="action" value="cancel" />
        <button className="button button-danger button-small" type="submit">Cancel</button>
      </form>
    </div>
  );
}

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
  const business = relationOne(membership.businesses);
  const role = membership.role as Role;
  const businessWide = role === "owner" || role === "admin";

  let allowedBranchIds: string[] | null = null;
  if (!businessWide) {
    const { data: assignments } = await supabase
      .from("branch_users")
      .select("branch_id")
      .eq("user_id", user.id);
    allowedBranchIds = (assignments ?? []).map((assignment) => assignment.branch_id);
  }

  let branches: { id: string; name: string; slug: string; status: string }[] = [];
  if (businessWide || (allowedBranchIds?.length ?? 0) > 0) {
    let query = supabase
      .from("branches")
      .select("id, name, slug, status")
      .eq("business_id", membership.business_id)
      .order("created_at", { ascending: true });
    if (!businessWide && allowedBranchIds) query = query.in("id", allowedBranchIds);
    const { data } = await query;
    branches = data ?? [];
  }

  const selectedBranchId = params.branch && branches.some((branch) => branch.id === params.branch)
    ? params.branch
    : branches[0]?.id;
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId);

  const { data: services } = selectedBranchId
    ? await supabase
        .from("services")
        .select("id, name, queue_prefix, is_active")
        .eq("branch_id", selectedBranchId)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
    : { data: [] };

  const { data: rawTickets } = selectedBranchId
    ? await supabase
        .from("tickets")
        .select("id, display_number, status, joined_at, service_id, customer_name_override, customer_phone_override, customers(name, phone), services(id, name)")
        .eq("branch_id", selectedBranchId)
        .order("joined_at", { ascending: true })
        .limit(150)
    : { data: [] };

  const tickets = (rawTickets ?? []) as QueueTicket[];

  const { data: queueConfig } = selectedBranchId
    ? await supabase.from("queue_configurations").select("staff_can_edit_name, staff_can_edit_mobile, manager_can_edit_name, manager_can_edit_mobile").eq("branch_id", selectedBranchId).maybeSingle()
    : { data: null };

  const ticketIds = tickets.map((ticket) => ticket.id);
  const { data: changeRows } = ticketIds.length
    ? await supabase.from("ticket_customer_changes").select("ticket_id, field_name, old_value, new_value, changed_by_type, created_at").in("ticket_id", ticketIds).order("created_at", { ascending: false })
    : { data: [] };
  const changesByTicket = new Map<string, ChangeRow[]>();
  for (const change of (changeRows ?? []) as ChangeRow[]) {
    const list = changesByTicket.get(change.ticket_id) ?? [];
    list.push(change);
    changesByTicket.set(change.ticket_id, list);
  }
  const canEditName = businessWide || (role === "manager" ? queueConfig?.manager_can_edit_name : queueConfig?.staff_can_edit_name);
  const canEditMobile = businessWide || (role === "manager" ? queueConfig?.manager_can_edit_mobile : queueConfig?.staff_can_edit_mobile);

  const activeTickets = tickets.filter((ticket) => ["waiting", "called", "serving"].includes(ticket.status));
  const finishedTickets = tickets.filter((ticket) => ["completed", "cancelled", "no_show"].includes(ticket.status)).reverse().slice(0, 20);

  return (
    <main className="dashboard-shell">
      <DashboardSidebar active="queues" />
      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">{businessWide ? "Business queue operations" : "Assigned branch queue"}</p>
            <h1>{business?.name ?? "QueueDrop"}</h1>
            <p className="muted page-lead">{businessWide ? "Operate queues across your business branches." : "You can operate only queues for branch locations assigned to your account."} Customer positions update automatically.</p>
          </div>
          <span className="env-badge">DEV</span>
        </header>

        {params.success ? <div className="notice notice-success">{params.success}</div> : null}
        {params.error ? <div className="notice notice-error">{params.error}</div> : null}

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
            {branches.map((branch) => (
              <Link key={branch.id} className={`queue-tab ${branch.id === selectedBranchId ? "queue-tab-active" : ""}`} href={`/dashboard/queues?branch=${branch.id}`}>
                {branch.name}
              </Link>
            ))}
          </div>

          {selectedBranchId && (services ?? []).length ? (
            <div className="queue-service-controls">
              {(services ?? []).map((service) => {
                const serviceTickets = activeTickets.filter((ticket) => ticket.service_id === service.id);
                const calledOrServing = serviceTickets.find((ticket) => ticket.status === "called" || ticket.status === "serving");
                const waitingCount = serviceTickets.filter((ticket) => ticket.status === "waiting").length;
                return (
                  <article className="queue-service-control" key={service.id}>
                    <div>
                      <strong>{service.name}</strong>
                      <span>{waitingCount} waiting{calledOrServing ? ` · ${calledOrServing.display_number} ${calledOrServing.status}` : ""}</span>
                    </div>
                    <form action={callNextAction}>
                      <input type="hidden" name="branch_id" value={selectedBranchId} />
                      <input type="hidden" name="service_id" value={service.id} />
                      <button className="button button-primary button-small" type="submit" disabled={!waitingCount || Boolean(calledOrServing)}>
                        Call next
                      </button>
                    </form>
                  </article>
                );
              })}
            </div>
          ) : null}

          {activeTickets.length ? (
            <div className="queue-ticket-list">
              {activeTickets.map((ticket) => {
                const customer = relationOne(ticket.customers);
                const service = relationOne(ticket.services);
                return (
                  <article className={`queue-ticket-row queue-ticket-${ticket.status}`} key={ticket.id}>
                    <div className="queue-ticket-number">{ticket.display_number}</div>
                    <div className="queue-ticket-main">
                      <strong>{ticket.customer_name_override ?? customer?.name ?? "Customer"}</strong>
                      <span>{service?.name ?? "Service"} · {ticket.customer_phone_override ?? customer?.phone ?? "No phone"}</span>
                      {(canEditName || canEditMobile) ? (
                        <details className="queue-edit-details">
                          <summary>Edit customer details</summary>
                          <form action={updateCustomerDetailsAction} className="queue-inline-edit">
                            <input type="hidden" name="branch_id" value={selectedBranchId ?? ""} />
                            <input type="hidden" name="ticket_id" value={ticket.id} />
                            {canEditName ? <input name="name" maxLength={100} defaultValue={ticket.customer_name_override ?? customer?.name ?? ""} aria-label="Customer name" /> : <input type="hidden" name="name" value={ticket.customer_name_override ?? customer?.name ?? ""} />}
                            {canEditMobile ? <input name="phone" defaultValue={ticket.customer_phone_override ?? customer?.phone ?? ""} aria-label="Customer mobile" /> : <input type="hidden" name="phone" value={ticket.customer_phone_override ?? customer?.phone ?? ""} />}
                            <button className="button button-secondary button-small" type="submit">Save</button>
                          </form>
                        </details>
                      ) : null}
                      {(changesByTicket.get(ticket.id) ?? []).length ? (
                        <details className="queue-history-details">
                          <summary>Change history ({(changesByTicket.get(ticket.id) ?? []).length})</summary>
                          <ul>
                            {(changesByTicket.get(ticket.id) ?? []).map((change, index) => (
                              <li key={`${change.created_at}-${index}`}><strong>{change.field_name}</strong>: {change.old_value || "—"} → {change.new_value || "—"} <span>by {change.changed_by_type} · {new Date(change.created_at).toLocaleString()}</span></li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                    <div className="queue-ticket-side">
                      <span className={`ticket-status-chip ticket-status-${ticket.status}`}>{ticket.status.replace("_", " ")}</span>
                      {selectedBranchId ? <TicketActions ticket={ticket} branchId={selectedBranchId} /> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mini-empty">
              <strong>No active queue tickets.</strong>
              <span>Open the customer join page and create a DEV ticket.</span>
            </div>
          )}
        </section>

        {finishedTickets.length ? (
          <section className="dashboard-section dashboard-section-stack management-list-card">
            <div>
              <p className="eyebrow">Recent history</p>
              <h2>Finished tickets</h2>
            </div>
            <div className="queue-ticket-list queue-history-list">
              {finishedTickets.map((ticket) => {
                const customer = relationOne(ticket.customers);
                const service = relationOne(ticket.services);
                return (
                  <article className="queue-ticket-row" key={ticket.id}>
                    <div className="queue-ticket-number">{ticket.display_number}</div>
                    <div className="queue-ticket-main">
                      <strong>{ticket.customer_name_override ?? customer?.name ?? "Customer"}</strong>
                      <span>{service?.name ?? "Service"}</span>
                    </div>
                    <span className={`ticket-status-chip ticket-status-${ticket.status}`}>{ticket.status.replace("_", " ")}</span>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
