"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function LiveStatus() {
  const router = useRouter();
  const [seconds, setSeconds] = useState(8);

  useEffect(() => {
    let remaining = 8;

    const timer = window.setInterval(() => {
      remaining -= 1;

      if (remaining <= 0) {
        router.refresh();
        remaining = 8;
      }

      setSeconds(remaining);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [router]);

  function refreshNow() {
    router.refresh();
    setSeconds(8);
  }

  return (
    <div className="ticket-live-row">
      <span>
        <span className="status-dot" />
        Live status
      </span>
      <button
        type="button"
        className="text-link ticket-refresh"
        onClick={refreshNow}
      >
        Refresh · {seconds}s
      </button>
    </div>
  );
}
