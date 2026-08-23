"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export function LiveQueueRefresh() {
  const router = useRouter();
  const [seconds, setSeconds] = useState(5);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let remaining = 5;

    const timer = window.setInterval(() => {
      remaining -= 1;

      if (remaining <= 0) {
        const modalOpen = document.body.dataset.qdModalOpen === "true";

        if (!modalOpen && !isPending) {
          startTransition(() => router.refresh());
        }

        remaining = 5;
      }

      setSeconds(remaining);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isPending, router]);

  return (
    <div className="ticket-live-row queue-live-refresh">
      <span>
        <span className="status-dot" /> Live queue
      </span>
      <button
        type="button"
        className="text-link ticket-refresh"
        onClick={() => {
          if (
            document.body.dataset.qdModalOpen !== "true" &&
            !isPending
          ) {
            startTransition(() => router.refresh());
          }
          setSeconds(5);
        }}
      >
        Refresh · {seconds}s
      </button>
    </div>
  );
}
