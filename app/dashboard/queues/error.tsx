"use client";

import { useEffect } from "react";

export default function QueueError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Error details remain in the browser console; do not expose stack traces in the UI.
    console.error("[QueueDrop queue render failure]", {
      message: error.message,
      digest: error.digest ?? null,
      stack: error.stack,
    });
  }, [error]);

  return (
    <main role="alert" className="mx-auto max-w-lg p-8">
      <h1 className="text-xl font-semibold">Queue temporarily unavailable</h1>
      <p className="mt-3">The live queue could not load. No ticket action was submitted by this page.</p>
      <button className="button mt-5" type="button" onClick={() => reset()}>Try again</button>
    </main>
  );
}
