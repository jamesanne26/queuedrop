"use client";

import { useState } from "react";

export function CopyTokenButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className="button button-secondary terminal-token-copy" type="button" onClick={copyToken}>
      {copied ? "Copied!" : "Copy token"}
    </button>
  );
}
