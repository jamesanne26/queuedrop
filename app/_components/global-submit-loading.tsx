"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

type Listener = () => void;

let loading = false;
const listeners = new Set<Listener>();
let timeoutId: ReturnType<typeof setTimeout> | undefined;

function emit() {
  for (const listener of listeners) listener();
}

function setGlobalLoading(next: boolean) {
  if (loading === next) return;
  loading = next;
  emit();
}

function startTimeout() {
  if (timeoutId) clearTimeout(timeoutId);
  timeoutId = setTimeout(() => {
    timeoutId = undefined;
    setGlobalLoading(false);
  }, 6000);
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return loading;
}

function getServerSnapshot() {
  return false;
}

export function GlobalSubmitLoading() {
  const pathname = usePathname();
  const isLoading = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );


  useEffect(() => {
    // A pathname change means the navigation completed.
    setGlobalLoading(false);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  }, [pathname]);

  useEffect(() => {
    if (!isLoading) return;
    // Server-action redirects often change only the query string. Poll the
    // address briefly while blocked so those in-app navigations also clear
    // the overlay immediately instead of waiting for the safety timeout.
    const startHref = window.location.href;
    const interval = window.setInterval(() => {
      if (window.location.href !== startHref) {
        window.clearInterval(interval);

        // Result redirects carry their success/error message in the query
        // string. Keep the loading layer mounted until DashboardResultModal
        // actually opens so users never see a blank delay between
        // “Please wait” and “Successfully saved”.
        const nextUrl = new URL(window.location.href);
        const hasResultMessage =
          nextUrl.searchParams.has("message") ||
          nextUrl.searchParams.has("error") ||
          nextUrl.searchParams.has("success");
        if (hasResultMessage) return;

        setGlobalLoading(false);
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
      }
    }, 80);
    return () => window.clearInterval(interval);
  }, [isLoading]);

  useEffect(() => {
    const handleSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.dataset.noGlobalLoading === "true") return;

      setGlobalLoading(true);
      startTimeout();
    };

    const handlePageShow = () => setGlobalLoading(false);
    const handleResultModalOpen = () => setGlobalLoading(false);
    const handleSubmitStart = () => {
      setGlobalLoading(true);
      startTimeout();
    };
    const handleSubmitComplete = () => setGlobalLoading(false);

    const observer = new MutationObserver(() => {
      if (document.body.dataset.qdModalOpen === "true") {
        setGlobalLoading(false);
      }
    });

    document.addEventListener("submit", handleSubmit, true);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("qd:result-modal-open", handleResultModalOpen);
    window.addEventListener("qd:submit-start", handleSubmitStart);
    window.addEventListener("qd:submit-complete", handleSubmitComplete);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-qd-modal-open"],
    });

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

  if (!isLoading) return null;

  return (
    <div
      className="qd-loading-backdrop"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <section className="qd-loading-modal">
        <div className="qd-loading-spinner" aria-hidden="true" />
        <strong>Please wait</strong>
      </section>
    </div>
  );
}
