"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { enterTvFullscreen, exitTvFullscreen } from "@/lib/tv/fullscreen";
import { visibleTvTicket, type TvTicket } from "@/lib/tv/config";
type Props = {
  branches: { id: string; name: string }[];
  selectedBranchId: string;
  initialTickets: TvTicket[];
  services: { id: string; name: string }[];
  sessionIds: string[];
  loadError: boolean;
};
export function TvQueueDisplay({ branches, selectedBranchId, initialTickets, services, sessionIds, loadError }: Props) {
  const router = useRouter();
  const [tickets, setTickets] = useState(initialTickets);
  const [snapshot, setSnapshot] = useState(initialTickets);
  const [connected, setConnected] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [isSwitching, startTransition] = useTransition();
  const connectedRef = useRef(false);
  // Refresh server data without remounting: remounts would leave fullscreen and
  // repeatedly disconnect Realtime. Guarded render adjustment follows React's
  // state-from-props pattern and retains live events between refreshes.
  if (snapshot !== initialTickets) { setSnapshot(initialTickets); setTickets(initialTickets); }
  const serviceKey = services.map(service => service.id).join(",");
  const sessionKey = sessionIds.join(",");
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    update();
    return () => { document.removeEventListener("fullscreenchange", update); void exitTvFullscreen(); };
  }, []);
  useEffect(() => {
    const serviceIds = serviceKey ? serviceKey.split(",") : [];
    const currentSessions = sessionKey ? sessionKey.split(",") : [];
    const supabase = createClient();
    connectedRef.current = false;
    const channel = supabase.channel("tv-queue-" + selectedBranchId + "-" + crypto.randomUUID())
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets", filter: "branch_id=eq." + selectedBranchId }, payload => {
        const next = payload.new as Partial<TvTicket>;
        const old = payload.old as Partial<TvTicket>;
        setTickets(current => {
          if (payload.eventType === "DELETE") return current.filter(ticket => ticket.id !== old.id);
          if (!next.id || !next.display_number || !next.status || !next.joined_at) return current;
          const without = current.filter(ticket => ticket.id !== next.id);
          return visibleTvTicket(next as TvTicket, selectedBranchId, currentSessions, serviceIds) ? [...without, next as TvTicket] : without;
        });
      }).subscribe(status => { const live = status === "SUBSCRIBED"; connectedRef.current = live; setConnected(live); });
    // Reconcile even a connected stream so closed sessions, midnight and changed
    // TV settings are picked up; missed events recover every 5 seconds offline.
    let ticks = 0;
    const poll = window.setInterval(() => {
      ticks++;
      if (navigator.onLine && (!connectedRef.current || ticks % 6 === 0)) router.refresh();
    }, 5000);
    const focus = () => { if (navigator.onLine) router.refresh(); };
    window.addEventListener("online", focus);
    return () => { window.clearInterval(poll); window.removeEventListener("online", focus); void supabase.removeChannel(channel); };
  }, [router, selectedBranchId, serviceKey, sessionKey]);
  const visible = useMemo(() => tickets.filter(ticket => visibleTvTicket(ticket, selectedBranchId, sessionIds, services.map(service => service.id))), [tickets, selectedBranchId, sessionIds, services]);
  async function back() { await exitTvFullscreen(); router.push("/dashboard"); }
  return <div className="tv-queue-page">
    {isSwitching ? <div className="qd-loading-backdrop" role="status"><section className="qd-loading-modal"><strong>Loading TV display…</strong></section></div> : null}
    <div className="tv-queue-toolbar">
      <button type="button" className="tv-back-button" onClick={back} aria-label="Back to dashboard">← Back</button>
      {!fullscreen ? <button type="button" className="tv-back-button" onClick={() => void enterTvFullscreen()}>Fullscreen</button> : null}
      <label><span className="sr-only">Branch</span><select value={selectedBranchId} onChange={event => startTransition(() => router.push("/dashboard/tv?branch=" + encodeURIComponent(event.target.value)))} aria-label="TV display branch" disabled={isSwitching}>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      <span className="tv-live-indicator" aria-label={connected ? "Live connected" : "Reconnecting"}>{connected ? "LIVE" : "…"}</span>
    </div>
    {loadError ? <p role="alert">Unable to load queue data. Reconnecting…</p> : null}
    <div className="tv-services-grid" data-service-count={services.length} aria-label="Displayed services">
      {services.map(service => {
        const items = visible.filter(ticket => ticket.service_id === service.id);
        const waiting = items.filter(ticket => ticket.status === "waiting").sort((a,b) => Date.parse(a.joined_at)-Date.parse(b.joined_at));
        const serving = items.filter(ticket => ["called","serving"].includes(ticket.status)).sort((a,b) => Date.parse(b.serving_at ?? b.called_at ?? b.joined_at)-Date.parse(a.serving_at ?? a.called_at ?? a.joined_at));
        return <section className="tv-service-card" data-service-id={service.id} key={service.id} aria-label={service.name}>
          <h1 className="tv-service-name">{service.name}</h1>
          <div className="tv-service-queues" aria-live="polite">
            <section className="tv-service-waiting"><h2>WAITING</h2><div className="tv-service-codes">{waiting.slice(0,8).map(ticket => <strong key={ticket.id}>{ticket.display_number}</strong>)}{!waiting.length ? <span className="tv-empty">—</span> : null}</div>{waiting.length>8 ? <small>+{waiting.length-8} more waiting</small> : null}</section>
            <section className="tv-service-serving"><h2>SERVING</h2><div className="tv-service-codes">{serving.slice(0,4).map(ticket => <strong key={ticket.id}>{ticket.display_number}</strong>)}{!serving.length ? <span className="tv-empty">—</span> : null}</div>{serving.length>4 ? <small>+{serving.length-4} more serving</small> : null}</section>
          </div>
        </section>;
      })}
      {!services.length ? <p className="tv-no-services">{loadError ? "Queue data is temporarily unavailable." : "No active services selected. Update this branch’s TV Display settings."}</p> : null}
    </div>
  </div>;
}
