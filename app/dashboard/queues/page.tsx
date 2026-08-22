import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import {
  callNextAction,
  updateCustomerDetailsAction,
  updateTicketAction,
} from "./actions";
import { LiveQueueRefresh } from "./live-queue-refresh";

type Props = {
  searchParams: Promise<{
    branch?: string;
    service?: string;
    success?: string;
    error?: string;
  }>;
};

type Role = "owner" | "admin" | "manager" | "staff";

type QueueTicket = {
  id: string;
  display_number: string;
  status:
    | "waiting"
    | "called"
    | "serving"
    | "completed"
    | "cancelled"
    | "no_show";
  joined_at: string;
  service_id: string;
  ticket_number: number;
  customer_name_override: string | null;
  customer_phone_override: string | null;
  customers:
    | { name: string | null; phone: string | null }
    | { name: string | null; phone: string | null }[]
    | null;
  services:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;
};

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function TicketActions({
  ticket,
  branchId,
}: {
  ticket: QueueTicket;
  branchId: string;
}) {
  if (
    ticket.status === "completed" ||
    ticket.status === "cancelled" ||
    ticket.status === "no_show"
  ) {
    return null;
  }

  return (
    <div className="live-row-actions">
      {ticket.status === "called" ? (
        <form action={updateTicketAction}>
          <input type="hidden" name="branch_id" value={branchId} />
          <input type="hidden" name="ticket_id" value={ticket.id} />
          <input type="hidden" name="action" value="serve" />
          <button className="button button-primary button-small" type="submit">
            Serve
          </button>
        </form>
      ) : null}

      {ticket.status === "serving" ? (
        <form action={updateTicketAction}>
          <input type="hidden" name="branch_id" value={branchId} />
          <input type="hidden" name="ticket_id" value={ticket.id} />
          <input type="hidden" name="action" value="complete" />
          <button className="button button-primary button-small" type="submit">
            Complete
          </button>
        </form>
      ) : null}

      {ticket.status === "waiting" || ticket.status === "called" ? (
        <form action={updateTicketAction}>
          <input type="hidden" name="branch_id" value={branchId} />
          <input type="hidden" name="ticket_id" value={ticket.id} />
          <input type="hidden" name="action" value="no_show" />
          <button className="button button-secondary button-small" type="submit">
            No-show
          </button>
        </form>
      ) : null}
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

    allowedBranchIds = (assignments ?? []).map(
      (assignment) => assignment.branch_id,
    );
  }

  let branches: {
    id: string;
    name: string;
    slug: string;
    status: string;
    address: string | null;
  }[] = [];

  if (businessWide || (allowedBranchIds?.length ?? 0) > 0) {
    let query = supabase
      .from("branches")
      .select("id, name, slug, status, address")
      .eq("business_id", membership.business_id)
      .order("created_at", { ascending: true });

    if (!businessWide && allowedBranchIds) {
      query = query.in("id", allowedBranchIds);
    }

    const { data } = await query;
    branches = data ?? [];
  }

  const selectedBranchId =
    params.branch &&
    branches.some((branch) => branch.id === params.branch)
      ? params.branch
      : branches[0]?.id;

  const selectedBranch = branches.find(
    (branch) => branch.id === selectedBranchId,
  );

  const { data: services } = selectedBranchId
    ? await supabase
        .from("services")
        .select("id, name, queue_prefix, is_active")
        .eq("branch_id", selectedBranchId)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
    : { data: [] };

  const selectedService =
    (services ?? []).find((service) => service.id === params.service) ?? null;

  const { data: rawTickets } = selectedBranchId
    ? await supabase
        .from("tickets")
        .select(
          "id, display_number, status, joined_at, service_id, ticket_number, customer_name_override, customer_phone_override, customers(name, phone), services(id, name)",
        )
        .eq("branch_id", selectedBranchId)
        .in("status", ["waiting", "called", "serving"])
        .order("joined_at", { ascending: true })
        .limit(250)
    : { data: [] };

  const tickets = (rawTickets ?? []) as QueueTicket[];

  const { data: queueConfig } = selectedBranchId
    ? await supabase
        .from("queue_configurations")
        .select(
          "staff_can_edit_name, staff_can_edit_mobile, manager_can_edit_name, manager_can_edit_mobile",
        )
        .eq("branch_id", selectedBranchId)
        .maybeSingle()
    : { data: null };

  const canEditName =
    businessWide ||
    (role === "manager"
      ? queueConfig?.manager_can_edit_name
      : queueConfig?.staff_can_edit_name);

  const canEditMobile =
    businessWide ||
    (role === "manager"
      ? queueConfig?.manager_can_edit_mobile
      : queueConfig?.staff_can_edit_mobile);

  const waitingPositionByTicket = new Map<string, number>();

  for (const service of services ?? []) {
    const waiting = tickets
      .filter(
        (ticket) =>
          ticket.service_id === service.id && ticket.status === "waiting",
      )
      .sort((a, b) => a.ticket_number - b.ticket_number);

    waiting.forEach((ticket, index) => {
      waitingPositionByTicket.set(ticket.id, index + 1);
    });
  }

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  let joinUrl: string | null = null;
  let qrDataUrl: string | null = null;

  if (business && selectedBranch && selectedService) {
    joinUrl = `${origin}/q/${business.slug}/${selectedBranch.slug}?service=${encodeURIComponent(
      selectedService.id,
    )}`;

    qrDataUrl = await QRCode.toDataURL(joinUrl, {
      width: 420,
      margin: 1,
      errorCorrectionLevel: "M",
    });
  }

  return (
    <main className="live-queue-shell">
      <LiveQueueRefresh />

      <header className="live-queue-topbar">
        <div className="live-queue-brand">
          <Link href="/" className="brand-mark">
            QueueDrop
          </Link>
          <div>
            <span className="live-dot" />
            <strong>Live Queue</strong>
            <small>
              {selectedBranch?.name ?? "No branch"}
              {selectedBranch?.address
                ? ` · ${selectedBranch.address}`
                : ""}
            </small>
          </div>
        </div>

        <div className="live-queue-top-actions">
          {branches.length > 1 ? (
            <div className="live-branch-switcher">
              {branches.map((branch) => (
                <Link
                  key={branch.id}
                  href={`/dashboard/queues?branch=${branch.id}`}
                  className={
                    branch.id === selectedBranchId
                      ? "live-branch-chip live-branch-chip-active"
                      : "live-branch-chip"
                  }
                >
                  {branch.name}
                </Link>
              ))}
            </div>
          ) : null}

          {role === "staff" ? (
            <form action={signOut}>
              <button className="button button-secondary" type="submit">
                Logout
              </button>
            </form>
          ) : (
            <Link href="/dashboard" className="button button-secondary">
              Exit live view
            </Link>
          )}
        </div>
      </header>

      {params.success ? (
        <div className="notice notice-success live-queue-notice">
          {params.success}
        </div>
      ) : null}

      {params.error ? (
        <div className="notice notice-error live-queue-notice">
          {params.error}
        </div>
      ) : null}

      <section className="live-queue-workspace">
        <div className="live-queue-list-panel">
          <div className="live-panel-heading">
            <div>
              <p className="eyebrow">Current queue</p>
              <h1>Queue list</h1>
            </div>
            <span className="status-chip">{tickets.length} active</span>
          </div>

          <div className="live-queue-table-wrap">
            <table className="live-queue-table">
              <thead>
                <tr>
                  <th>Queue</th>
                  <th>Service</th>
                  <th>Position</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => {
                  const customer = relationOne(ticket.customers);
                  const service = relationOne(ticket.services);
                  const position = waitingPositionByTicket.get(ticket.id);

                  return (
                    <tr key={ticket.id}>
                      <td>
                        <strong>{ticket.display_number}</strong>
                      </td>
                      <td>
                        <span>{service?.name ?? "Service"}</span>
                        {(canEditName || canEditMobile) ? (
                          <details className="live-customer-edit">
                            <summary>
                              {ticket.customer_name_override ??
                                customer?.name ??
                                "Customer"}
                            </summary>
                            <form
                              action={updateCustomerDetailsAction}
                              className="queue-inline-edit"
                            >
                              <input
                                type="hidden"
                                name="branch_id"
                                value={selectedBranchId ?? ""}
                              />
                              <input
                                type="hidden"
                                name="ticket_id"
                                value={ticket.id}
                              />
                              {canEditName ? (
                                <input
                                  name="name"
                                  maxLength={100}
                                  defaultValue={
                                    ticket.customer_name_override ??
                                    customer?.name ??
                                    ""
                                  }
                                  aria-label="Customer name"
                                />
                              ) : (
                                <input
                                  type="hidden"
                                  name="name"
                                  value={
                                    ticket.customer_name_override ??
                                    customer?.name ??
                                    ""
                                  }
                                />
                              )}
                              {canEditMobile ? (
                                <input
                                  name="phone"
                                  defaultValue={
                                    ticket.customer_phone_override ??
                                    customer?.phone ??
                                    ""
                                  }
                                  aria-label="Customer mobile"
                                />
                              ) : (
                                <input
                                  type="hidden"
                                  name="phone"
                                  value={
                                    ticket.customer_phone_override ??
                                    customer?.phone ??
                                    ""
                                  }
                                />
                              )}
                              <button
                                className="button button-secondary button-small"
                                type="submit"
                              >
                                Save
                              </button>
                            </form>
                          </details>
                        ) : null}
                      </td>
                      <td>
                        <strong>{position ?? "—"}</strong>
                      </td>
                      <td>
                        <span
                          className={`ticket-status-chip ticket-status-${ticket.status}`}
                        >
                          {ticket.status.replace("_", " ")}
                        </span>
                      </td>
                      <td>
                        {selectedBranchId ? (
                          <TicketActions
                            ticket={ticket}
                            branchId={selectedBranchId}
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!tickets.length ? (
              <div className="mini-empty">
                <strong>No active queue tickets.</strong>
                <span>Select a service and display its QR code.</span>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="live-service-panel">
          <div className="live-panel-heading">
            <div>
              <p className="eyebrow">Customer entry</p>
              <h2>Select a service</h2>
            </div>
          </div>

          <div className="live-service-buttons">
            {(services ?? []).map((service) => (
              <Link
                key={service.id}
                href={`/dashboard/queues?branch=${selectedBranchId}&service=${service.id}`}
                scroll={false}
                className={
                  selectedService?.id === service.id
                    ? "live-service-button live-service-button-active"
                    : "live-service-button"
                }
              >
                <strong>{service.name}</strong>
                <span>Generate customer QR</span>
              </Link>
            ))}
          </div>

          <form className="live-service-mobile-form" method="get">
            <input
              type="hidden"
              name="branch"
              value={selectedBranchId ?? ""}
            />
            <label>
              Service
              <select
                name="service"
                defaultValue={selectedService?.id ?? ""}
                required
              >
                <option value="" disabled>
                  Select service
                </option>
                {(services ?? []).map((service) => (
                  <option value={service.id} key={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button button-primary" type="submit">
              Generate QR
            </button>
          </form>

          {selectedService && qrDataUrl && joinUrl ? (
            <div className="live-qr-card">
              <div className="live-selected-service">
                <span>Selected service</span>
                <strong>{selectedService.name}</strong>
              </div>

              <img
                src={qrDataUrl}
                alt={`QR code for ${selectedService.name}`}
                className="live-qr-image"
              />

              <p>Scan this QR code to join the queue.</p>

              <div className="live-qr-actions">
                <Link
                  className="button button-secondary"
                  href={`${joinUrl}&assist=1`}
                  target="_blank"
                >
                  Fill up for customer
                </Link>

                <form action={callNextAction}>
                  <input
                    type="hidden"
                    name="branch_id"
                    value={selectedBranchId ?? ""}
                  />
                  <input
                    type="hidden"
                    name="service_id"
                    value={selectedService.id}
                  />
                  <button className="button button-primary" type="submit">
                    Call next
                  </button>
                </form>
              </div>

              <small>
                Use “Fill up for customer” when staff needs to assist a senior,
                PWD, or any customer who cannot complete the form.
              </small>
            </div>
          ) : (
            <div className="live-service-empty">
              <strong>Select a service.</strong>
              <span>
                QueueDrop will show the QR code customers can scan using their
                phone.
              </span>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
