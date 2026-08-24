"use client";

import { useEffect, useRef, useState } from "react";

const MAX_LOADING_MS = 6000;
const URL_CHECK_MS = 200;

export function GlobalSubmitLoading() {
  const [loading, setLoading] = useState(false);
  const startUrlRef = useRef("");

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let urlCheckId: ReturnType<typeof setInterval> | undefined;

    const stopLoading = () => {
      setLoading(false);
      startUrlRef.current = "";
      if (timeoutId) clearTimeout(timeoutId);
      if (urlCheckId) clearInterval(urlCheckId);
      timeoutId = undefined;
      urlCheckId = undefined;
    };

    const handleSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.dataset.noGlobalLoading === "true") return;

      startUrlRef.current = window.location.href;
      setLoading(true);

      if (timeoutId) clearTimeout(timeoutId);
      if (urlCheckId) clearInterval(urlCheckId);

      urlCheckId = setInterval(() => {
        if (startUrlRef.current && window.location.href !== startUrlRef.current) {
          stopLoading();
        }
      }, URL_CHECK_MS);

      timeoutId = setTimeout(stopLoading, MAX_LOADING_MS);
    };

    const handlePageShow = () => stopLoading();

    document.addEventListener("submit", handleSubmit, true);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("submit", handleSubmit, true);
      window.removeEventListener("pageshow", handlePageShow);
      if (timeoutId) clearTimeout(timeoutId);
      if (urlCheckId) clearInterval(urlCheckId);
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
