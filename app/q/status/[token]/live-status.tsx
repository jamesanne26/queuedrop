"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function LiveStatus({ refreshSeconds = 8 }: { refreshSeconds?: number }) {
  const router = useRouter();
  const interval = Math.max(3, Math.min(300, Number(refreshSeconds) || 8));
  const [seconds, setSeconds] = useState(interval);

  useEffect(() => {
    let remaining = interval;
    const timer = window.setInterval(() => {
      if (document.hidden || !navigator.onLine) return;
      remaining -= 1;
      if (remaining <= 0) {
        router.refresh();
        remaining = interval;
      }
      setSeconds(remaining);
    }, 1000);
    const resume = () => {
      if (!document.hidden && navigator.onLine) { router.refresh(); remaining = interval; setSeconds(remaining); }
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [router, interval]);

  return (
    <div className="ticket-live-row">
      <span><span className="status-dot" />Live queue</span>
      <button type="button" className="text-link ticket-refresh" onClick={() => { router.refresh(); setSeconds(interval); }}>
        Refresh in {seconds}s
      </button>
    </div>
  );
}
