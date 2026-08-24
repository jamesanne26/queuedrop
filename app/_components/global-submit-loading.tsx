"use client";

import { useEffect, useState } from "react";

export function GlobalSubmitLoading() {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const handleSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.dataset.noGlobalLoading === "true") return;

      setLoading(true);
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setLoading(false), 12000);
    };

    const handlePageShow = () => setLoading(false);

    document.addEventListener("submit", handleSubmit, true);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("submit", handleSubmit, true);
      window.removeEventListener("pageshow", handlePageShow);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  if (!loading) return null;

  return (
    <div className="qd-loading-backdrop" role="status" aria-live="polite" aria-label="Loading">
      <section className="qd-loading-modal">
        <div className="qd-loading-spinner" aria-hidden="true" />
        <strong>Please wait</strong>
        <span>Loading QueueDrop...</span>
      </section>
    </div>
  );
}
