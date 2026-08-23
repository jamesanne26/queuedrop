import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LiveStatus } from "./live-status";
import { updateCustomerTicket } from "./actions";
import { DigitsOnlyInput } from "@/app/_components/digits-only-input";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ message?: string; error?: string }>;
};

type QueueListItem = {
  display_number: string;
  position: number;
  is_you: boolean;
  customer_name: string | null;
};

type TicketStatus = {
  ticket_id: string;
  display_number: string;
  status:
    | "waiting"
    | "called"
    | "serving"
    | "completed"
    | "cancelled"
    | "no_show";
  position: number;
  customer_name: string | null;
  customer_phone: string | null;
  customer_can_edit_name: boolean;
  customer_can_edit_mobile: boolean;
  business_name: string;
  branch_name: string;
  branch_phone: string | null;
  service_name: string;
  joined_at: string;
  queue_list: QueueListItem[];
};

function statusCopy(status: TicketStatus["status"], position: number) {
  if (status === "waiting") {
    if (position === 1) return "You are next in line";
    if (position === 2) return "2nd position";
    if (position === 3) return "3rd position";
    return `${position}th position`;
  }

  if (status === "called") return "You are being called";
  if (status === "serving") return "Now serving you";
  if (status === "completed") return "Service completed";
  if (status === "no_show") return "Marked as no-show";
  return "Ticket cancelled";
}

export default async function TicketStatusPage({
  params,
  searchParams,
}: Props) {
  const { token } = await params;
  const notices = await searchParams;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_public_ticket_status", {
    target_session_token: token,
  });

  if (error || !data) notFound();

  const ticket = data as TicketStatus;
  const editable =
    (ticket.customer_can_edit_name ||
      ticket.customer_can_edit_mobile) &&
    ["waiting", "called"].includes(ticket.status);

  return (
    <main className="ticket-status-shell">
      <section className="ticket-status-card">
        <div className="public-queue-brand-row">
          <Link href="/" className="brand-mark">
            QueueDrop
          </Link>
          <span
            className={`ticket-status-chip ticket-status-${ticket.status}`}
          >
            {ticket.status.replace("_", " ")}
          </span>
        </div>

        <LiveStatus />

        {notices.message ? (
          <div className="notice notice-success">{notices.message}</div>
        ) : null}

        {notices.error ? (
          <div className="notice notice-error">{notices.error}</div>
        ) : null}

        <div className="ticket-number-block">
          <p className="eyebrow">Queue for {ticket.service_name}</p>
          <div className="ticket-display-number">
            {ticket.display_number}
          </div>
          <h1>{statusCopy(ticket.status, ticket.position)}</h1>
        </div>

        <dl className="ticket-details">
          <div>
            <dt>Name</dt>
            <dd>{ticket.customer_name ?? "Customer"}</dd>
          </div>
          <div>
            <dt>Mobile</dt>
            <dd>{ticket.customer_phone ?? "—"}</dd>
          </div>
          <div>
            <dt>Branch</dt>
            <dd>{ticket.branch_name}</dd>
          </div>
          <div>
            <dt>Business</dt>
            <dd>{ticket.business_name}</dd>
          </div>
        </dl>

        <section className="customer-queue-list-card">
          <div>
            <p className="eyebrow">Queue list</p>
            <h2>{ticket.service_name}</h2>
            <p className="muted">
              Queue numbers and positions are visible. Other customers&apos;
              names stay private.
            </p>
          </div>

          <div className="customer-queue-list">
            <div className="customer-queue-list-head">
              <span>Queue</span>
              <span>Position</span>
            </div>

            {(ticket.queue_list ?? []).map((item) => (
              <div
                className={
                  item.is_you
                    ? "customer-queue-list-row customer-queue-list-row-you"
                    : "customer-queue-list-row"
                }
                key={item.display_number}
              >
                <div>
                  <strong>{item.display_number}</strong>
                  {item.is_you ? (
                    <small>
                      {item.customer_name ?? ticket.customer_name ?? "You"} · You
                    </small>
                  ) : null}
                </div>
                <strong>{item.position}</strong>
              </div>
            ))}
          </div>
        </section>

        {editable ? (
          <details className="ticket-edit-panel">
            <summary>Edit queue details</summary>
            <form
              action={updateCustomerTicket}
              className="form-stack compact-form"
            >
              <input type="hidden" name="token" value={token} />

              {ticket.customer_can_edit_name ? (
                <label>
                  Name
                  <input
                    name="name"
                    maxLength={100}
                    defaultValue={ticket.customer_name ?? ""}
                  />
                </label>
              ) : (
                <input
                  type="hidden"
                  name="name"
                  value={ticket.customer_name ?? ""}
                />
              )}

              {ticket.customer_can_edit_mobile ? (
                <label>
                  Mobile
                  <DigitsOnlyInput
                    name="phone"
                    maxLength={20}
                    defaultValue={ticket.customer_phone ?? ""}
                  />
                </label>
              ) : (
                <input
                  type="hidden"
                  name="phone"
                  value={ticket.customer_phone ?? ""}
                />
              )}

              <button
                className="button button-secondary"
                type="submit"
              >
                Save changes
              </button>
            </form>
          </details>
        ) : null}

        {ticket.branch_phone ? (
          <p className="public-contact">
            Branch contact: {ticket.branch_phone}
          </p>
        ) : null}

        <p className="ticket-security-note">
          Keep this private link. It gives access to this queue ticket for up
          to 24 hours.
        </p>
      </section>
    </main>
  );
}
