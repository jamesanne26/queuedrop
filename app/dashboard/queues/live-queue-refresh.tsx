"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = { branchId: string };

type TicketChangeDetail = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
};

const LIVE_EVENT = "queuedrop:ticket-change";

export function LiveQueueRefresh({ branchId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [connected, setConnected] = useState(false);
  const connectedRef = useRef(false);
  const refreshTimer = useRef<number | null>(null);
  const deferredRefresh = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    const doRefresh = () => {
      if (document.body.dataset.qdModalOpen === "true") {
        deferredRefresh.current = true;
        return;
      }
      deferredRefresh.current = false;
      startTransition(() => router.refresh());
    };

    const refreshSoon = (delay = 180) => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(doRefresh, delay);
    };

    const channel = supabase
      .channel(`queue-live-${branchId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets" },
        (payload) => {
          // Update the visible queue immediately. A server refresh follows in the
          // background to hydrate relationship data (customer session, etc.).
          window.dispatchEvent(new CustomEvent<TicketChangeDetail>(LIVE_EVENT, {
            detail: {
              eventType: payload.eventType as TicketChangeDetail["eventType"],
              new: (payload.new as Record<string, unknown>) ?? null,
              old: (payload.old as Record<string, unknown>) ?? null,
            },
          }));
          refreshSoon();
        },
      )
      .subscribe((status) => {
        const isConnected = status === "SUBSCRIBED";
        connectedRef.current = isConnected;
        setConnected(isConnected);
        if (isConnected) refreshSoon(0);
      });

    // Realtime is primary. This low-frequency safety refresh is intentionally
    // light and only exists to recover from a missed websocket event.
    const fallback = window.setInterval(() => {
      if (!connectedRef.current && navigator.onLine) doRefresh();
    }, 12000);

    const onVisible = () => {
      if (document.visibilityState === "visible") doRefresh();
    };
    const onOnline = () => doRefresh();
    const onModalClosed = () => {
      if (deferredRefresh.current && document.body.dataset.qdModalOpen !== "true") doRefresh();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("queuedrop:modal-closed", onModalClosed);

    return () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      window.clearInterval(fallback);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("queuedrop:modal-closed", onModalClosed);
      void supabase.removeChannel(channel);
    };
  }, [branchId, router]);

  return (
    <div className="ticket-live-row queue-live-refresh">
      <span>
        <span className="status-dot" /> {connected ? "Live connected" : "Reconnecting…"}
      </span>
      <button
        type="button"
        className="text-link ticket-refresh"
        disabled={isPending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {isPending ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
