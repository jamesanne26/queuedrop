"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { validRequestId } from "@/lib/queue/reliability";
import { createClient } from "@/lib/supabase/client";

type ServiceOption = { id: string; name: string; queue_prefix?: string | null };
type TerminalInfo = {
  device_name: string;
  branch_name: string;
  business_name: string;
  service_id: string;
  service_name: string;
  services?: ServiceOption[];
  stub_mode_enabled: boolean;
  queue_active: boolean;
  branch_open: boolean;
  exit_pin_configured?: boolean;
  terminal_theme?: string;
  terminal_page_bg_color?: string;
  terminal_press_bg_color?: string;
  terminal_accent_color?: string;
  terminal_text_color?: string;
  terminal_muted_text_color?: string;
  terminal_background_image_url?: string | null;
  terminal_logo_url?: string | null;
  terminal_background_overlay?: number;
};

type Ticket = {
  ticket_id: string;
  print_job_id: string;
  session_token: string;
  display_number: string;
  position: number;
  business_name: string;
  branch_name: string;
  service_name: string;
  status_url: string;
};

declare global {
  interface Window {
    QueueDropPrinter?: { printStub: (payload: string) => void };
  }
}

export function StubTerminal({ deviceToken, terminal, protectedExit = false }: { deviceToken: string; terminal: TerminalInfo; protectedExit?: boolean }) {
  const router = useRouter();
  const serviceOptions = useMemo(() => terminal.services?.length ? terminal.services : [{ id: terminal.service_id, name: terminal.service_name }], [terminal]);
  const [serviceId, setServiceId] = useState(terminal.service_id || serviceOptions[0]?.id || "");
  const pendingRequest = useRef<{ serviceId: string; requestId: string } | null>(null);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [lastTicket, setLastTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState("");
  const [exitOpen, setExitOpen] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [exitError, setExitError] = useState("");
  const [pin, setPin] = useState("");
  const available = terminal.stub_mode_enabled && terminal.queue_active && terminal.branch_open && Boolean(serviceId);

  async function getStub() {
    if (submitting.current || !available) return;
    submitting.current = true;
    const storageKey = `queuedrop:pending-stub:${deviceToken}`;
    if (!pendingRequest.current) {
      try {
        const stored = JSON.parse(sessionStorage.getItem(storageKey) || "null");
        if (validRequestId(stored?.requestId) && serviceOptions.some(service => service.id === stored.serviceId)) {
          pendingRequest.current = stored;
          setServiceId(stored.serviceId);
        }
      } catch { /* Storage can be disabled on kiosk browsers. */ }
    }
    if (!pendingRequest.current) {
      pendingRequest.current = { serviceId, requestId: crypto.randomUUID() };
    }
    try { sessionStorage.setItem(storageKey, JSON.stringify(pendingRequest.current)); } catch { /* Retry still works in this page. */ }
    setBusy(true);
    setError("");
    setLastTicket(null);
    try {
      const response = await fetch(`/api/kiosk/${encodeURIComponent(deviceToken)}/ticket`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(pendingRequest.current),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to issue a stub.");
      const ticket = result as Ticket;
      setLastTicket(ticket);

      pendingRequest.current = null;
      try { sessionStorage.removeItem(storageKey); } catch { /* No persistent storage. */ }
      // Print Bridge owns both printing and acknowledgment. A WebView call
      // cannot prove paper was printed and used to race the background worker.
    } catch (e) {
      setError(e instanceof Error && e.name === "TimeoutError"
        ? "Connection timed out. Press again to recover the same stub."
        : e instanceof Error ? e.message : "Unable to issue a stub. Press again to retry.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function exitKiosk() {
    if (exitBusy) return;
    if (!terminal.exit_pin_configured) {
      setExitError("Set the terminal exit PIN in Dashboard → Terminals first.");
      return;
    }
    setExitBusy(true);
    setExitError("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("verify_kiosk_exit_pin", {
        target_device_token: deviceToken,
        target_pin: pin,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Incorrect PIN.");
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setExitError(e instanceof Error ? e.message : "Unable to exit kiosk mode.");
      setPin("");
    } finally {
      setExitBusy(false);
    }
  }

  return (
    <section className="stub-terminal-card stub-terminal-card-press">
      {protectedExit ? <button type="button" className="stub-back-button" onClick={() => { setExitOpen(true); setExitError(""); }}>← Back</button> : null}
      <div className="stub-terminal-brand">QueueDrop</div>
      {terminal.terminal_logo_url ? <Image unoptimized className="stub-business-logo" src={terminal.terminal_logo_url} alt={`${terminal.business_name} logo`} width={180} height={180} /> : null}
      <div className="stub-terminal-copy stub-terminal-copy-compact">
        <p>{terminal.business_name}</p>
        <h1>{terminal.branch_name}</h1>
      </div>

      <label className="stub-service-picker">
        <span>Choose service</span>
        <select value={serviceId} onChange={(event) => { setServiceId(event.target.value); setLastTicket(null); setError(""); }} disabled={busy || Boolean(error)}>
          {serviceOptions.map((service) => <option key={service.id} value={service.id}>{service.name}{service.id === terminal.service_id ? " (Default)" : ""}</option>)}
        </select>
      </label>

      <button className="stub-get-button stub-get-button-press" type="button" onClick={getStub} disabled={!available || busy} aria-label="Press here to get stub">
        <strong>{busy ? "PLEASE WAIT…" : "PRESS HERE"}</strong>
        <span>{busy ? "Creating your stub" : "to get stub"}</span>
      </button>

      {!available ? <div className="stub-terminal-message">Queue is currently closed.</div> : null}
      {lastTicket ? <div className="stub-terminal-success stub-terminal-success-print"><strong>{lastTicket.display_number}</strong><span>Stub sent to Print Bridge</span></div> : null}
      {error ? <div className="stub-terminal-error">{error}</div> : null}
      <small className="stub-terminal-hint">Get Stub creates a physical print job. Scan the QR on the printed stub to see the live queue status.</small>

      {exitOpen ? <div className="stub-pin-overlay" role="dialog" aria-modal="true" aria-labelledby="stub-exit-title">
        <form className="stub-pin-dialog" onSubmit={(event) => { event.preventDefault(); void exitKiosk(); }}>
          <button className="stub-pin-close" type="button" aria-label="Close" onClick={() => { setExitOpen(false); setPin(""); setExitError(""); }}>×</button>
          <p className="eyebrow">Protected exit</p>
          <h2 id="stub-exit-title">Enter exit PIN</h2>
          <p className="muted">The dashboard stays protected while customers use Get Stub mode.</p>
          <input autoFocus aria-label="Exit PIN" type="password" inputMode="numeric" pattern="[0-9]{4,8}" minLength={4} maxLength={8} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="••••" />
          {exitError ? <div className="stub-terminal-error">{exitError}</div> : null}
          <button className="button button-primary" type="submit" disabled={exitBusy || pin.length < 4}>{exitBusy ? "Checking…" : "Return to dashboard"}</button>
        </form>
      </div> : null}
    </section>
  );
}
