"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Ticket = {
  id: string;
  branch_id: string;
  display_number: string;
  status: "waiting" | "called" | "serving";
  joined_at: string;
  called_at: string | null;
  serving_at: string | null;
};

type Branch = { id: string; name: string };

type Props = {
  branches: Branch[];
  selectedBranchId: string;
  initialTickets: Ticket[];
};

export function TvQueueDisplay({ branches, selectedBranchId, initialTickets }: Props) {
  const router = useRouter();
  const [tickets, setTickets] = useState(initialTickets);
  const [connected, setConnected] = useState(false);
  const connectedRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let refreshTimer: number | null = null;
    const refreshSoon = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => router.refresh(), 250);
    };

    const channel = supabase
      .channel(`tv-queue-${selectedBranchId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, (payload) => {
        const next = payload.new as Partial<Ticket> | null;
        const old = payload.old as Partial<Ticket> | null;
        const branchId = next?.branch_id ?? old?.branch_id;
        if (branchId !== selectedBranchId) return;

        setTickets((current) => {
          if (payload.eventType === "DELETE") return current.filter((ticket) => ticket.id !== old?.id);
          if (!next?.id || !next.display_number || !next.status) return current;
          const normalized = next as Ticket;
          const visible = ["waiting", "called", "serving"].includes(normalized.status);
          const without = current.filter((ticket) => ticket.id !== normalized.id);
          return visible ? [...without, normalized] : without;
        });
        refreshSoon();
      })
      .subscribe((status) => {
        const live = status === "SUBSCRIBED";
        connectedRef.current = live;
        setConnected(live);
      });

    const fallback = window.setInterval(() => {
      if (!connectedRef.current && navigator.onLine) router.refresh();
    }, 15000);

    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      window.clearInterval(fallback);
      void supabase.removeChannel(channel);
    };
  }, [router, selectedBranchId]);

  const waiting = useMemo(
    () => tickets.filter((ticket) => ticket.status === "waiting").sort((a, b) => Date.parse(a.joined_at) - Date.parse(b.joined_at)),
    [tickets],
  );
  const serving = useMemo(
    () => tickets.filter((ticket) => ticket.status === "called" || ticket.status === "serving")
      .sort((a, b) => Date.parse(b.serving_at ?? b.called_at ?? b.joined_at) - Date.parse(a.serving_at ?? a.called_at ?? a.joined_at)),
    [tickets],
  );

  function changeBranch(branchId: string) {
    router.push(`/dashboard/tv?branch=${encodeURIComponent(branchId)}`);
  }

  return (
    <div className="tv-queue-page">
      <div className="tv-queue-toolbar">
        <button type="button" className="tv-back-button" onClick={() => router.push("/dashboard")} aria-label="Back to dashboard">← Back</button>
        <label>
          <span className="sr-only">Branch</span>
          <select value={selectedBranchId} onChange={(event) => changeBranch(event.target.value)} aria-label="TV display branch">
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>
        <span className="tv-live-indicator" aria-label={connected ? "Live connected" : "Reconnecting"}>{connected ? "LIVE" : "…"}</span>
      </div>

      <div className="tv-queue-grid" aria-live="polite">
        <section className="tv-queue-column">
          <h1>WAITING</h1>
          <div className="tv-code-list">
            {waiting.map((ticket) => <strong key={ticket.id}>{ticket.display_number}</strong>)}
            {!waiting.length ? <span className="tv-empty">—</span> : null}
          </div>
        </section>
        <section className="tv-queue-column">
          <h1>SERVING</h1>
          <div className="tv-code-list">
            {serving.map((ticket) => <strong key={ticket.id}>{ticket.display_number}</strong>)}
            {!serving.length ? <span className="tv-empty">—</span> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
