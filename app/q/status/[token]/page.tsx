import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LiveStatus } from "./live-status";
import { updateSmsNumber } from "./actions";
import { DigitsOnlyInput } from "@/app/_components/digits-only-input";
import { StickyPositionIndicator } from "./sticky-position-indicator";
import { SMS_COUNTRIES, splitSmsRecipient } from "@/lib/notifications/phone";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ message?: string; error?: string }> };
type QueueListItem = { display_number: string; position: number; is_you: boolean };
type TicketStatus = {
  ticket_id: string;
  display_number: string;
  status: "waiting"|"called"|"serving"|"completed"|"cancelled"|"no_show";
  position: number;
  sms_phone: string|null;
  customer_refresh_seconds: number;
  business_name: string;
  branch_name: string;
  service_name: string;
  queue_list: QueueListItem[];
  source?: string;
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
  return "Cancelled";
}

export default async function TicketStatusPage({ params, searchParams }: Props) {
  const { token } = await params;
  const notices = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_stub_ticket_status", { target_session_token: token });
  if (error || !data) notFound();
  const ticket = data as TicketStatus;
  const active = ["waiting", "called"].includes(ticket.status);
  const smsInput = splitSmsRecipient(ticket.sms_phone);

  return <main className="ticket-status-shell customer-ticket-page">
    <section className="ticket-status-card customer-ticket-hero">
      <div className="customer-ticket-browserbar"><span>● ● ●</span><span>Live queue</span></div>
      <LiveStatus refreshSeconds={ticket.customer_refresh_seconds} />
      <StickyPositionIndicator anchorId="customer-position-anchor" value={headline(ticket)} label={ticket.status === "waiting" ? "Your position" : "Queue status"} />
      {notices.message ? <div className="notice notice-success">{notices.message}</div> : null}
      {notices.error ? <div className="notice notice-error">{notices.error}</div> : null}
      <div className="customer-position-block" id="customer-position-anchor">
        <div className="customer-ticket-identity"><strong className="customer-ticket-branch-name">{ticket.branch_name}</strong><span className="customer-ticket-service-name">{ticket.service_name}</span></div><div className="customer-ticket-topline"><span className={`ticket-status-chip ticket-status-${ticket.status}`}>{ticket.status.replace("_", " ")}</span></div>
        <div className="position-number customer-position-number">{headline(ticket)}</div>
        <h1>{ticket.status === "waiting" ? "position in queue" : "queue status"}</h1>
        <div className="demo-person customer-ticket-person"><div><strong>Queue {ticket.display_number}</strong><span>{ticket.source === "web" ? "Keep this page open or bookmark it" : "Keep your printed stub until your turn"}</span></div><span className="live-badge">{active ? "Live" : "Closed"}</span></div>
      </div>
      <dl className="ticket-details customer-ticket-details">
        <div><dt>SMS alerts</dt><dd>{ticket.sms_phone ? "Enabled" : "Not enabled"}</dd></div>
        <div><dt>Branch</dt><dd>{ticket.branch_name}</dd></div>
      </dl>
      {active ? <details className="ticket-edit-panel" open={!ticket.sms_phone}><summary>{ticket.sms_phone ? "SMS notification number" : "Notify me by SMS"}</summary>
        <form action={updateSmsNumber} className="form-stack compact-form"><input type="hidden" name="token" value={token}/><div className="customer-sms-phone-row"><label>Country code<select name="country_dial_code" defaultValue={smsInput.country.dialCode}>{SMS_COUNTRIES.map((country) => <option key={country.code} value={country.dialCode}>{country.flag} {country.name} (+{country.dialCode})</option>)}</select></label><label>Mobile number<DigitsOnlyInput name="phone" required maxLength={15} defaultValue={smsInput.local} placeholder={smsInput.country.code === "PH" ? "9171234567" : "Mobile number"}/></label></div><p className="muted">Optional. QueueDrop stores the number with its country code and uses it only for queue-position SMS alerts for this stub.</p><button className="button button-secondary" type="submit">{ticket.sms_phone ? "Update SMS number" : "Enable SMS alerts"}</button></form>
      </details> : null}
    </section>
    <section className="ticket-status-card customer-queue-list-card customer-queue-below"><div><p className="eyebrow">Current queue</p><h2>{ticket.service_name}</h2><p className="muted">Queue numbers only. Your queue number is highlighted.</p></div><div className="customer-queue-list"><div className="customer-queue-list-head"><span>Queue</span><span>Position</span></div>{(ticket.queue_list ?? []).map((item) => <div className={item.is_you ? "customer-queue-list-row customer-queue-list-row-you" : "customer-queue-list-row"} key={item.display_number}><div><strong>{item.display_number}</strong><small>{item.is_you ? "Your queue" : "Waiting"}</small></div><strong className="customer-queue-position">{item.position}</strong></div>)}</div></section>
    <p className="ticket-security-note"><Link href="/">QueueDrop</Link> private queue link. Keep it private.</p>
  </main>;
}
