"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function LiveQueueRefresh() {
  const router = useRouter();
  const [seconds, setSeconds] = useState(5);

  useEffect(() => {
    let remaining = 5;

    const timer = window.setInterval(() => {
      remaining -= 1;

      if (remaining <= 0) {
        router.refresh();
        remaining = 5;
      }

      setSeconds(remaining);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <div className="ticket-live-row queue-live-refresh">
      <span>
        <span className="status-dot" /> Live queue
      </span>
      <button
        type="button"
        className="text-link ticket-refresh"
        onClick={() => {
          router.refresh();
          setSeconds(5);
        }}
      >
        Refresh · {seconds}s
      </button>
    </div>
  );
}
