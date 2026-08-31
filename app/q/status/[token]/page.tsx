import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LiveStatus } from "./live-status";
import { updateCustomerTicket } from "./actions";
import { LeaveQueueForm } from "./leave-queue-form";
import { MoveDownForm } from "./move-down-form";
import { DigitsOnlyInput } from "@/app/_components/digits-only-input";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ message?: string; error?: string }> };
type QueueListItem = { display_number: string; position: number; is_you: boolean; customer_name: string | null };
type TicketStatus = {
  ticket_id: string; display_number: string; status: "waiting"|"called"|"serving"|"completed"|"cancelled"|"no_show";
  position: number; customer_name: string|null; customer_phone: string|null;
  customer_can_edit_name: boolean; customer_can_edit_mobile: boolean; customer_can_move_down: boolean; customer_refresh_seconds: number; exit_code: string;
  business_name: string; branch_name: string; branch_phone: string|null; service_name: string; joined_at: string; queue_list: QueueListItem[];
};

function ordinal(position: number) {
  const mod100 = position % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${position}th`;
  if (position % 10 === 1) return `${position}st`;
  if (position % 10 === 2) return `${position}nd`;
  if (position % 10 === 3) return `${position}rd`;
  return `${position}th`;
}

function headline(ticket: TicketStatus) {
  if (ticket.status === "waiting") return ordinal(Math.max(ticket.position, 1));
  if (ticket.status === "called") return "Called";
  if (ticket.status === "serving") return "Serving";
  if (ticket.status === "completed") return "Done";
  if (ticket.status === "no_show") return "No-show";
  return "Left";
}

export default async function TicketStatusPage({ params, searchParams }: Props) {
  const { token } = await params;
  const notices = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_ticket_status", { target_session_token: token });
  if (error || !data) notFound();
  const ticket = data as TicketStatus;
  const active = ["waiting", "called"].includes(ticket.status);
  const editable = active && (ticket.customer_can_edit_name || ticket.customer_can_edit_mobile);

  return (
    <main className="ticket-status-shell customer-ticket-page">
      <section className="ticket-status-card customer-ticket-hero">
        <div className="customer-ticket-browserbar"><span>● ● ●</span><span>Live queue</span></div>
        <LiveStatus refreshSeconds={ticket.customer_refresh_seconds} />
        {notices.message ? <div className="notice notice-success">{notices.message}</div> : null}
        {notices.error ? <div className="notice notice-error">{notices.error}</div> : null}
        <div className="customer-position-block">
          <div className="customer-ticket-topline">
            <p className="eyebrow">{ticket.service_name}</p>
            <span className={`ticket-status-chip ticket-status-${ticket.status}`}>{ticket.status.replace("_", " ")}</span>
          </div>
          <div className="position-number customer-position-number">{headline(ticket)}</div>
          <h1>{ticket.status === "waiting" ? "position in queue" : "queue status"}</h1>
          <div className="demo-person customer-ticket-person">
            <div><strong>{ticket.customer_name ?? "Customer"}</strong><span>Queue {ticket.display_number}</span></div>
            <span className="live-badge">{active ? "Live" : "Closed"}</span>
          </div>
        </div>

        <dl className="ticket-details customer-ticket-details">
          <div><dt>Mobile</dt><dd>{ticket.customer_phone ?? "-"}</dd></div>
          <div><dt>Branch</dt><dd>{ticket.branch_name}</dd></div>
          <div><dt>Business</dt><dd>{ticket.business_name}</dd></div>
        </dl>

        {editable ? <details className="ticket-edit-panel"><summary>Edit my details</summary>
          <form action={updateCustomerTicket} className="form-stack compact-form"><input type="hidden" name="token" value={token} />
            {ticket.customer_can_edit_name ? <label>Name<input name="name" maxLength={100} defaultValue={ticket.customer_name ?? ""} /></label> : <input type="hidden" name="name" value={ticket.customer_name ?? ""} />}
            {ticket.customer_can_edit_mobile ? <label>Mobile<DigitsOnlyInput name="phone" maxLength={20} defaultValue={ticket.customer_phone ?? ""} /></label> : <input type="hidden" name="phone" value={ticket.customer_phone ?? ""} />}
            <button className="button button-secondary" type="submit">Save changes</button>
          </form>
        </details> : null}
        {active ? <LeaveQueueForm token={token} exitCode={ticket.exit_code} /> : null}
        {ticket.branch_phone ? <p className="public-contact">Branch contact: {ticket.branch_phone}</p> : null}
      </section>

      <section className="ticket-status-card customer-queue-list-card customer-queue-below">
        <div><p className="eyebrow">Current queue</p><h2>{ticket.service_name}</h2><p className="muted">Other customer names are hidden. Your row is highlighted.</p></div>
        <div className="customer-queue-list">
          <div className="customer-queue-list-head"><span>Queue</span><span aria-hidden="true"></span><span>Position</span></div>
          {(ticket.queue_list ?? []).map((item) => {
            const canMoveThisRow = item.is_you && ticket.status === "waiting" && ticket.customer_can_move_down && ticket.position > 0 && ticket.position < (ticket.queue_list?.length ?? 0);
            return <div className={item.is_you ? "customer-queue-list-row customer-queue-list-row-you" : "customer-queue-list-row"} key={item.display_number}>
              <div><strong>{item.display_number}</strong><small>{item.is_you ? `${item.customer_name ?? ticket.customer_name ?? "You"} - You` : "Name hidden"}</small></div>
              <div className="customer-queue-row-action">{canMoveThisRow ? <MoveDownForm token={token} confirmationCode={ticket.exit_code} compact /> : null}</div>
              <strong className="customer-queue-position">{item.position}</strong>
            </div>;
          })}
        </div>
      </section>
      <p className="ticket-security-note"><Link href="/">QueueDrop</Link> private ticket link. Keep it private.</p>
    </main>
  );
}
