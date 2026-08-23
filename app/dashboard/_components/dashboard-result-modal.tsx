"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Props = {
  success?: string;
  error?: string;
};

export function DashboardResultModal({ success, error }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const message = error ?? success ?? "";
  const [dismissedMessage, setDismissedMessage] = useState<string | null>(null);
  const open = Boolean(message) && dismissedMessage !== message;

  useEffect(() => {
    document.body.dataset.qdModalOpen = open ? "true" : "false";
    return () => {
      delete document.body.dataset.qdModalOpen;
    };
  }, [open]);

  if (!open || (!success && !error)) return null;

  const isError = Boolean(error);

  function close() {
    setDismissedMessage(message);

    const next = new URLSearchParams(searchParams.toString());
    next.delete("message");
    next.delete("error");
    next.delete("success");

    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="qd-modal-backdrop" role="presentation">
      <section
        className="qd-modal qd-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-result-title"
      >
        <div
          className={
            isError
              ? "qd-confirm-icon qd-confirm-icon-danger"
              : "qd-confirm-icon"
          }
        >
          {isError ? "!" : "✓"}
        </div>

        <div className="qd-confirm-copy">
          <h2 id="dashboard-result-title">
            {isError ? "Unable to save" : "Saved successfully"}
          </h2>
          <p>{message}</p>
        </div>

        <div className="qd-modal-actions">
          <button className="button button-primary" type="button" onClick={close}>
            OK
          </button>
        </div>
      </section>
    </div>
  );
}
