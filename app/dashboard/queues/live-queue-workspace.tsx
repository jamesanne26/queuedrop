"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { recalculateQueuePositions } from "@/lib/queue/positions";
import { callNextAction, updateTicketAction, loadServiceHistoryAction, simulateGetStubInlineAction, type ServiceHistoryTicket } from "./actions";

type Role = "owner" | "admin" | "manager" | "staff";
type Branch = { id: string; name: string; address: string | null; status?: string | null };
type Service = { id: string; name: string };
type Ticket = {
  id: string;
  display_number: string;
  ticket_number: number;
  status: "waiting" | "called" | "serving";
  service_id: string;
  service_name: string;
  position: number | null;
  sms_enabled: boolean;
  sms_phone: string | null;
  session_token: string | null;
  joined_at: string;
  called_at: string | null;
  serving_at: string | null;
  updated_at: string;
};

type Props = {
  role: Role;
  canSimulateStub: boolean;
  canViewHistory: boolean;
  canManageTerminals: boolean;
  queuePermissions: { call: boolean; serve: boolean; returnLast: boolean; movePending: boolean; complete: boolean; cancel: boolean; noShow: boolean };
  businessName: string;
  selectedBranchId: string;
  selectedBranch: Branch;
  branches: Branch[];
  services: Service[];
  initialServiceId: string | null;
  tickets: Ticket[];
  currentSessionDate: string;
  successMessage?: string;
  errorMessage?: string;
};

type ConfirmAction = "cancel" | "return_last";

type ConfirmState = { ticket: Ticket; action: ConfirmAction; code: string } | null;

function ActionButton({ children, className = "button button-secondary", disabled = false }: { children: ReactNode; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" disabled={disabled || pending}>{pending ? "Please wait…" : children}</button>;
}

export function LiveQueueWorkspace({ selectedBranchId, selectedBranch, branches, services, initialServiceId, tickets, currentSessionDate, canSimulateStub, canViewHistory, canManageTerminals, queuePermissions, successMessage, errorMessage }: Props) {
  const router = useRouter();
  const [liveTickets, setLiveTickets] = useState<Ticket[]>(tickets);
  const [isBranchSwitching, startBranchTransition] = useTransition();
  const inactiveBranch = selectedBranch.status !== "active";
  const defaultServiceId = initialServiceId && services.some((s) => s.id === initialServiceId) ? initialServiceId : services[0]?.id ?? "";
  const [serviceId, setServiceId] = useState(defaultServiceId);
  const [history, setHistory] = useState<ServiceHistoryTicket[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [stubBusy, setStubBusy] = useState(false);
  const historyRequestId = useRef(0);
  // Keep only the selected ticket id, then derive the preview from liveTickets.
  // A newly-created ticket can arrive over Realtime before its customer_sessions
  // row is visible to the queue reconciliation query. Storing a Ticket snapshot
  // here would permanently preserve session_token=null for an already-open modal,
  // even after reconciliation fetched the token. Deriving from liveTickets lets
  // the open customer preview self-heal as soon as the related session arrives.
  const [previewTicketId, setPreviewTicketId] = useState<string | null>(null);
  const previewTicket = previewTicketId ? liveTickets.find((ticket) => ticket.id === previewTicketId) ?? null : null;
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [flash, setFlash] = useState<{ type: "success" | "error"; message: string } | null>(
    successMessage ? { type: "success", message: successMessage } : errorMessage ? { type: "error", message: errorMessage } : null,
  );


  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let reconcileBusy = false;

    const applyRealtimeRow = (eventType: "INSERT" | "UPDATE" | "DELETE", nextRow: Record<string, unknown> | null, oldRow: Record<string, unknown> | null) => {
      const row = (eventType === "DELETE" ? oldRow : nextRow) ?? {};
      if (String(row.branch_id ?? "") !== selectedBranchId) return;
      const id = String(row.id ?? "");
      if (!id) return;

      setLiveTickets((current) => {
        if (eventType === "DELETE") return recalculateQueuePositions(current.filter((ticket) => ticket.id !== id));
        const status = String(row.status ?? "");
        const active = status === "waiting" || status === "called" || status === "serving";
        const existing = current.find((ticket) => ticket.id === id);
        if (!active) return recalculateQueuePositions(current.filter((ticket) => ticket.id !== id));

        const serviceId = String(row.service_id ?? existing?.service_id ?? "");
        const serviceName = services.find((service) => service.id === serviceId)?.name ?? existing?.service_name ?? "Service";
        const next: Ticket = {
          id,
          display_number: String(row.display_number ?? existing?.display_number ?? "Queue"),
          ticket_number: Number(row.ticket_number ?? existing?.ticket_number ?? 0),
          status: status as Ticket["status"],
          service_id: serviceId,
          service_name: serviceName,
          position: existing?.position ?? null,
          sms_enabled: Boolean(row.sms_phone ?? existing?.sms_phone),
          sms_phone: (row.sms_phone as string | null | undefined) ?? existing?.sms_phone ?? null,
          session_token: existing?.session_token ?? null,
          joined_at: String(row.joined_at ?? existing?.joined_at ?? new Date().toISOString()),
          called_at: (row.called_at as string | null | undefined) ?? existing?.called_at ?? null,
          serving_at: (row.serving_at as string | null | undefined) ?? existing?.serving_at ?? null,
          updated_at: String(row.updated_at ?? existing?.updated_at ?? new Date().toISOString()),
        };
        return recalculateQueuePositions(existing ? current.map((ticket) => ticket.id === id ? next : ticket) : [...current, next]);
      });
    };

    const reconcile = async () => {
      if (reconcileBusy || disposed || !navigator.onLine) return;
      reconcileBusy = true;
      try {
        const { data, error } = await supabase.from("tickets")
          .select("id,display_number,status,joined_at,called_at,serving_at,updated_at,service_id,ticket_number,sms_phone,customer_sessions(session_token),services(id,name),queue_sessions!inner(session_date,status)")
          .eq("branch_id", selectedBranchId)
          .eq("queue_sessions.session_date", currentSessionDate)
          .eq("queue_sessions.status", "open")
          .in("status", ["waiting", "called", "serving"])
          .order("joined_at", { ascending: true })
          .limit(250);
        if (error || disposed) return;
        const fresh: Ticket[] = (data ?? []).map((row) => {
          const service = Array.isArray(row.services) ? row.services[0] : row.services;
          const customerSession = Array.isArray(row.customer_sessions) ? row.customer_sessions[0] : row.customer_sessions;
          return {
            id: row.id,
            display_number: row.display_number,
            ticket_number: row.ticket_number,
            status: row.status,
            service_id: row.service_id,
            service_name: service?.name ?? services.find((item) => item.id === row.service_id)?.name ?? "Service",
            position: null,
            sms_enabled: Boolean(row.sms_phone),
            sms_phone: row.sms_phone,
            session_token: customerSession?.session_token ?? null,
            joined_at: row.joined_at,
            called_at: row.called_at,
            serving_at: row.serving_at,
            updated_at: row.updated_at,
          } satisfies Ticket;
        });
        setLiveTickets(recalculateQueuePositions(fresh));
      } finally {
        reconcileBusy = false;
      }
    };

    // Subscribe without a server-side branch filter. RLS still limits what the
    // signed-in operator can receive, while client-side filtering avoids a class
    // of missed postgres_changes events seen with filtered subscriptions.
    const channel = supabase.channel(`queue-workspace-${selectedBranchId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, (payload) => {
        applyRealtimeRow(
          payload.eventType as "INSERT" | "UPDATE" | "DELETE",
          (payload.new as Record<string, unknown>) ?? null,
          (payload.old as Record<string, unknown>) ?? null,
        );
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void reconcile();
      });

    // Realtime should normally update in under a second. This is a deliberately
    // lightweight safety reconciliation so the UI self-heals even when a Wi-Fi
    // hop, browser sleep, or websocket edge drops one database event.
    const safetyTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void reconcile();
    }, 2500);
    const onVisible = () => { if (document.visibilityState === "visible") void reconcile(); };
    const onOnline = () => void reconcile();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    void reconcile();

    return () => {
      disposed = true;
      window.clearInterval(safetyTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      void supabase.removeChannel(channel);
    };
  }, [selectedBranchId, currentSessionDate, services]);

  useEffect(() => {
    const onTicketChange = (event: Event) => {
      const detail = (event as CustomEvent<{ eventType: "INSERT" | "UPDATE" | "DELETE"; new: Record<string, unknown> | null; old: Record<string, unknown> | null }>).detail;
      if (!detail) return;
      const row = (detail.eventType === "DELETE" ? detail.old : detail.new) ?? {};
      if (String(row.branch_id ?? "") !== selectedBranchId) return;
      const id = String(row.id ?? "");
      if (!id) return;

      setLiveTickets((current) => {
        if (detail.eventType === "DELETE") return current.filter((ticket) => ticket.id !== id);

        const status = String(row.status ?? "");
        const active = status === "waiting" || status === "called" || status === "serving";
        const existing = current.find((ticket) => ticket.id === id);
        if (!active) return current.filter((ticket) => ticket.id !== id);

        const serviceId = String(row.service_id ?? existing?.service_id ?? "");
        const serviceName = services.find((service) => service.id === serviceId)?.name ?? existing?.service_name ?? "Service";
        const ticketNumber = Number(row.ticket_number ?? existing?.ticket_number ?? 0);
        const joinedAt = String(row.joined_at ?? existing?.joined_at ?? new Date().toISOString());
        const next: Ticket = {
          id,
          display_number: String(row.display_number ?? existing?.display_number ?? "Queue"),
          ticket_number: ticketNumber,
          status: status as Ticket["status"],
          service_id: serviceId,
          service_name: serviceName,
          position: existing?.position ?? null,
          sms_enabled: Boolean(row.sms_phone ?? existing?.sms_phone),
          sms_phone: (row.sms_phone as string | null | undefined) ?? existing?.sms_phone ?? null,
          session_token: existing?.session_token ?? null,
          joined_at: joinedAt,
          called_at: (row.called_at as string | null | undefined) ?? existing?.called_at ?? null,
          serving_at: (row.serving_at as string | null | undefined) ?? existing?.serving_at ?? null,
          updated_at: String(row.updated_at ?? existing?.updated_at ?? new Date().toISOString()),
        };

        const merged = existing ? current.map((ticket) => ticket.id === id ? next : ticket) : [...current, next];
        return recalculateQueuePositions(merged);
      });
    };
    window.addEventListener("queuedrop:ticket-change", onTicketChange);
    return () => window.removeEventListener("queuedrop:ticket-change", onTicketChange);
  }, [selectedBranchId, services]);

  useEffect(() => {
    const message = successMessage || errorMessage;
    if (!message) return;

    const url = new URL(window.location.href);
    url.searchParams.delete("success");
    url.searchParams.delete("error");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);

    const showTimer = window.setTimeout(() => {
      setFlash({ type: successMessage ? "success" : "error", message });
    }, 0);
    const hideTimer = window.setTimeout(() => setFlash(null), errorMessage ? 4200 : 2600);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [successMessage, errorMessage]);

  useEffect(() => {
    const open = Boolean(confirm || previewTicket);
    if (open) document.body.dataset.qdModalOpen = "true";
    else delete document.body.dataset.qdModalOpen;
    return () => { delete document.body.dataset.qdModalOpen; };
  }, [confirm, previewTicket]);

  useEffect(() => {
    if (!confirm && !previewTicket) window.dispatchEvent(new Event("queuedrop:modal-closed"));
  }, [confirm, previewTicket]);

  const selectedService = services.find((s) => s.id === serviceId) ?? null;
  const filtered = useMemo(() => liveTickets.filter((t) => !serviceId || t.service_id === serviceId), [liveTickets, serviceId]);
  const serving = filtered.filter((t) => t.status === "serving");
  const pending = filtered.filter((t) => t.status === "called");
  const waiting = filtered.filter((t) => t.status === "waiting").sort((a,b) => (a.position ?? 999999) - (b.position ?? 999999));

  function navigateBranch(branchId: string) {
    if (!branchId || branchId === selectedBranchId || isBranchSwitching) return;
    startBranchTransition(() => router.replace(`/dashboard/queues?branch=${encodeURIComponent(branchId)}`, { scroll: false }));
  }

  async function issueTestStub() {
    if (!serviceId || stubBusy) return;
    setStubBusy(true);
    setFlash(null);
    try {
      const result = await simulateGetStubInlineAction(selectedBranchId, serviceId);
      setFlash({ type: result.ok ? "success" : "error", message: result.message });
    } catch (error) {
      setFlash({ type: "error", message: error instanceof Error ? error.message : "Unable to issue test stub." });
    } finally {
      setStubBusy(false);
    }
  }

  async function showHistory() {
    if (historyLoading) return;
    const requestId = ++historyRequestId.current;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const rows = await loadServiceHistoryAction(selectedBranchId);
      if (historyRequestId.current === requestId) setHistory(rows);
    } catch {
      if (historyRequestId.current === requestId) {
        setHistoryError("Unable to load recent stub history. Please try again.");
      }
    } finally {
      if (historyRequestId.current === requestId) setHistoryLoading(false);
    }
  }

  function openConfirm(ticket: Ticket, action: ConfirmAction) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    setConfirm({ ticket, action, code: String(1000 + (values[0] % 9000)) });
    setConfirmInput("");
  }

  function closeConfirm() { setConfirm(null); setConfirmInput(""); }

  const TicketLink = ({ ticket }: { ticket: Ticket }) => (
    <button type="button" className="live-ticket-number-button" onClick={() => setPreviewTicketId(ticket.id)} title="Open customer phone view">
      <span>{ticket.display_number}</span>{ticket.sms_enabled ? <span className="live-mobile-icon" aria-label="Mobile number added" title="Mobile number added">📱</span> : null}
    </button>
  );

  const ServingRow = ({ ticket }: { ticket: Ticket }) => (
    <article className="live-ticket-card live-ticket-card-compact live-serving-row-v4">
      <div className="live-ticket-main"><TicketLink ticket={ticket}/><span>{ticket.service_name}</span></div>
      <div className="live-ticket-meta"><strong>Now serving</strong><span>{ticket.sms_enabled ? "SMS enabled" : "Stub only"}</span></div>
      <div className="live-ticket-action live-ticket-multi-actions">
        {queuePermissions.complete ? <form action={updateTicketAction} data-no-global-loading="true"><input type="hidden" name="branch_id" value={selectedBranchId}/><input type="hidden" name="service_id" value={ticket.service_id}/><input type="hidden" name="ticket_id" value={ticket.id}/><input type="hidden" name="action" value="complete"/><ActionButton className="button button-primary">Complete</ActionButton></form> : null}
        {queuePermissions.returnLast ? <button className="button button-secondary" type="button" onClick={() => openConfirm(ticket, "return_last")}>Return to last</button> : null}
        {queuePermissions.movePending ? <form action={updateTicketAction} data-no-global-loading="true"><input type="hidden" name="branch_id" value={selectedBranchId}/><input type="hidden" name="service_id" value={ticket.service_id}/><input type="hidden" name="ticket_id" value={ticket.id}/><input type="hidden" name="action" value="pending"/><ActionButton className="button button-secondary">Move to pending</ActionButton></form> : null}
      </div>
    </article>
  );

  const PendingRow = ({ ticket }: { ticket: Ticket }) => (
    <article className="live-ticket-card live-ticket-card-compact live-pending-row-v4">
      <div className="live-ticket-main"><TicketLink ticket={ticket}/><span>{ticket.service_name}</span></div>
      <div className="live-ticket-meta"><strong>Pending</strong><span>{ticket.sms_enabled ? "SMS enabled" : "Stub only"}</span></div>
      <div className="live-ticket-action live-ticket-multi-actions">
        {queuePermissions.serve ? <form action={updateTicketAction} data-no-global-loading="true"><input type="hidden" name="branch_id" value={selectedBranchId}/><input type="hidden" name="service_id" value={ticket.service_id}/><input type="hidden" name="ticket_id" value={ticket.id}/><input type="hidden" name="action" value="serve"/><ActionButton className="button button-primary">Move to serving</ActionButton></form> : null}
        {queuePermissions.cancel ? <button className="text-link live-cancel-link" type="button" onClick={() => openConfirm(ticket, "cancel")}>Cancel</button> : null}
      </div>
    </article>
  );

  const WaitingRow = ({ ticket }: { ticket: Ticket }) => (
    <article className="live-ticket-card">
      <div className="live-ticket-main"><TicketLink ticket={ticket}/><span>{ticket.service_name}</span></div>
      <div className="live-ticket-meta"><strong>#{ticket.position ?? "-"} in line</strong><span>{ticket.sms_enabled ? "SMS enabled" : "Stub only"}</span></div>
      <div className="live-ticket-action">{queuePermissions.cancel ? <button className="text-link live-cancel-link" type="button" onClick={() => openConfirm(ticket, "cancel")}>Cancel</button> : null}</div>
    </article>
  );

  return <section className="dashboard-content live-queue-page live-queue-page-v4">
    {isBranchSwitching ? <div className="qd-loading-backdrop" role="status" aria-live="polite"><section className="qd-loading-modal"><div className="qd-loading-spinner" /><strong>Please wait</strong><small>Loading {selectedBranch.name} queue…</small></section></div> : null}
    <header className="dashboard-header live-queue-header-v4">
      <div><p className="eyebrow">Live queue</p><h1>{selectedBranch.name}</h1>{selectedBranch.address ? <p className="muted">{selectedBranch.address}</p> : null}</div>
      <label className="live-business-branch-picker">
        <span>Branch</span>
        <select value={selectedBranchId} onChange={(e) => navigateBranch(e.target.value)} disabled={isBranchSwitching}>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.status === "active" ? "" : " (Inactive)"}</option>)}
        </select>
      </label>
    </header>

    {flash ? <div className={`notice ${flash.type === "success" ? "notice-success" : "notice-error"} live-queue-flash`} role="status">{flash.message}</div> : null}

    {inactiveBranch ? <div className="live-confirm-backdrop" role="presentation"><section className="live-confirm-dialog" role="dialog" aria-modal="true" aria-label="Inactive branch"><div className="live-confirm-heading"><div><p className="eyebrow">Branch unavailable</p><h2>{selectedBranch.name} is inactive</h2></div></div><p className="live-confirm-copy">Queue controls are disabled for inactive branches. Select an active branch to continue.</p><label className="live-service-picker-v2"><span>Select active branch</span><select defaultValue="" onChange={(event) => { if (event.target.value) navigateBranch(event.target.value); }}><option value="" disabled>Choose a branch</option>{branches.filter((branch) => branch.status === "active").map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></section></div> : null}

    <section className="dashboard-section live-command-bar live-command-bar-v4">
      <label className="live-service-picker-v2"><span>Queue service</span><select value={serviceId} onChange={(e) => setServiceId(e.target.value)} aria-label="Queue service">{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <div className="live-command-actions">
        {canSimulateStub ? <div className="live-test-stub-form-v2"><button className="button live-get-stub-button-v2" type="button" onClick={() => void issueTestStub()} disabled={!selectedService || stubBusy}>{stubBusy ? "Please wait…" : "＋ Get test stub"}</button><span>DEV / CLIENT ADMIN</span></div> : null}
        {queuePermissions.call ? <form action={callNextAction} data-no-global-loading="true"><input type="hidden" name="branch_id" value={selectedBranchId}/><input type="hidden" name="service_id" value={serviceId}/><ActionButton className="button button-primary live-primary-action" disabled={!selectedService}>Call next</ActionButton></form> : null}
        <a className="button button-secondary" href="/dashboard">Dashboard</a>
        {canViewHistory ? <button className="button button-secondary" type="button" onClick={showHistory} disabled={historyLoading} aria-busy={historyLoading}>{historyLoading ? "Loading history…" : "History"}</button> : null}
        {canManageTerminals ? <a className="button button-secondary" href={`/dashboard/settings?branch=${encodeURIComponent(selectedBranchId)}&view=branch-terminals`}>Terminals</a> : null}
      </div>
    </section>

    <section className="live-current-grid live-current-grid-v4">
      <div className="dashboard-section live-current-panel live-serving-panel"><div className="live-panel-title"><div><span className="live-status-dot"/><h2>Now serving</h2></div><strong>{serving.length}</strong></div><div className="live-current-list">{serving.length ? serving.map((t) => <ServingRow ticket={t} key={t.id}/>) : <div className="live-empty-state"><strong>No stub being served</strong><span>Move a pending stub to serving when ready.</span></div>}</div></div>
      <div className="dashboard-section live-current-panel live-pending-panel"><div className="live-panel-title"><div><span className="live-status-dot live-status-dot-pending"/><h2>Pending</h2></div><strong>{pending.length}</strong></div><div className="live-current-list">{pending.length ? pending.map((t) => <PendingRow ticket={t} key={t.id}/>) : <div className="live-empty-state"><strong>No pending stub</strong><span>Call next to move the first waiting stub here.</span></div>}</div></div>
    </section>

    <section className="dashboard-section live-waiting-panel"><div className="live-waiting-header"><div><p className="eyebrow">Up next</p><h2>Waiting queue</h2><span>{selectedService?.name ?? "Service"}</span></div><div className="live-waiting-count"><strong>{waiting.length}</strong><span>waiting</span></div></div>{waiting.length ? <div className="live-waiting-grid">{waiting.map((t) => <WaitingRow ticket={t} key={t.id}/>)}</div> : <div className="live-empty-state live-empty-state-large"><strong>No one is waiting</strong><span>New terminal stubs will appear here automatically.</span></div>}</section>

    {historyError ? <div className="notice notice-error live-history-error" role="alert">{historyError}</div> : null}
    {history ? <div className="live-confirm-backdrop live-history-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistory(null); }}><section className="dashboard-section live-history-panel live-history-modal" role="dialog" aria-modal="true" aria-label="Recent stub history"><div className="live-column-head"><h2>Recent stub history</h2><button className="live-confirm-close" type="button" onClick={() => setHistory(null)} aria-label="Close history">×</button></div><div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>Queue</th><th>Branch</th><th>Service</th><th>Status</th><th>Joined</th></tr></thead><tbody>{history.map((row) => <tr key={row.id}><td><strong>{row.display_number}</strong></td><td>{row.branch_name}</td><td>{row.service_name}</td><td>{row.status}</td><td>{new Date(row.joined_at).toLocaleString()}</td></tr>)}</tbody></table></div></section></div> : null}

    {previewTicket ? <div className="live-confirm-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setPreviewTicketId(null); }}><section className="live-phone-preview-dialog" role="dialog" aria-modal="true" aria-label={`Customer view for ${previewTicket.display_number}`}><div className="live-phone-preview-heading"><div><p className="eyebrow">Customer phone view</p><h2>{previewTicket.display_number}{previewTicket.sms_enabled ? <span className="live-mobile-icon">📱</span> : null}</h2><p>{previewTicket.sms_phone ? `Mobile: ${previewTicket.sms_phone}` : "No mobile number added"}</p></div><button type="button" className="live-confirm-close" onClick={() => setPreviewTicketId(null)} aria-label="Close">×</button></div>{previewTicket.session_token ? <div className="live-phone-shell"><div className="live-phone-speaker"/><iframe title={`Customer status ${previewTicket.display_number}`} src={`/q/status/${previewTicket.session_token}`}/></div> : <div className="live-empty-state live-phone-unavailable"><strong>Customer link unavailable</strong><span>This stub has no active status token.</span></div>}</section></div> : null}

    {confirm ? <div className="live-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeConfirm(); }}><section className="live-confirm-dialog" role="dialog" aria-modal="true"><div className="live-confirm-heading"><div><p className="eyebrow">Verification required</p><h2>{confirm.action === "cancel" ? `Cancel ${confirm.ticket.display_number}?` : `Return ${confirm.ticket.display_number} to last?`}</h2></div><button type="button" className="live-confirm-close" onClick={closeConfirm} aria-label="Close">×</button></div><p className="live-confirm-copy">{confirm.action === "cancel" ? "This removes the stub from the active queue." : "This moves the serving stub to the end of the waiting queue."} Type the verification code to continue.</p><div className="live-confirm-code">{confirm.code}</div><form action={updateTicketAction} className="live-confirm-form" data-no-global-loading="true" onSubmit={() => { const submitted = confirm; window.setTimeout(() => { if (submitted?.action === "cancel") setLiveTickets((current) => recalculateQueuePositions(current.filter((ticket) => ticket.id !== submitted.ticket.id))); closeConfirm(); }, 0); }}><input type="hidden" name="branch_id" value={selectedBranchId}/><input type="hidden" name="service_id" value={confirm.ticket.service_id}/><input type="hidden" name="ticket_id" value={confirm.ticket.id}/><input type="hidden" name="action" value={confirm.action}/><input type="hidden" name="expected_code" value={confirm.code}/><label><span>Type {confirm.code} to confirm</span><input name="confirm_code" inputMode="numeric" autoComplete="off" maxLength={4} value={confirmInput} onChange={(event) => setConfirmInput(event.target.value.replace(/\D/g, "").slice(0, 4))} autoFocus/></label><div className="live-confirm-actions"><button type="button" className="button button-secondary" onClick={closeConfirm}>Go back</button><ActionButton className={confirm.action === "cancel" ? "button live-danger-button" : "button button-primary"} disabled={confirmInput !== confirm.code}>{confirm.action === "cancel" ? "Cancel stub" : "Return to last"}</ActionButton></div></form></section></div> : null}
  </section>;
}
