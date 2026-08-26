
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
    const handleResultModalOpen = () => setLoading(false);
    const handleSubmitStart = () => setLoading(true);
    const handleSubmitComplete = () => setLoading(false);

    const observer = new MutationObserver(() => {
      if (document.body.dataset.qdModalOpen === "true") setLoading(false);
    });

    document.addEventListener("submit", handleSubmit, true);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("qd:result-modal-open", handleResultModalOpen);
    window.addEventListener("qd:submit-start", handleSubmitStart);
    window.addEventListener("qd:submit-complete", handleSubmitComplete);
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-qd-modal-open"] });

    return () => {
      document.removeEventListener("submit", handleSubmit, true);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("qd:result-modal-open", handleResultModalOpen);
      window.removeEventListener("qd:submit-start", handleSubmitStart);
      window.removeEventListener("qd:submit-complete", handleSubmitComplete);
      observer.disconnect();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  if (!loading) return null;

  return (
    <div className="qd-loading-backdrop" role="status" aria-live="polite" aria-label="Loading">
      <section className="qd-loading-modal">
        <div className="qd-loading-spinner" aria-hidden="true" />
        <strong>Please wait</strong>
      </section>
    </div>
  );
}
