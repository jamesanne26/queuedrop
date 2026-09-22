"use client";

import { useState } from "react";

export function CopyTokenButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      className="button button-secondary"
      onClick={handleCopy}
    >
      {copied ? "Copied" : "Copy Token"}
    </button>
  );
}
