"use client";

import { useState } from "react";

export function CopyTokenButton({ token }: { token: string }) {
  const [copied, setCopied] = useState<"token" | "url" | null>(null);

  async function copy(value: string, kind: "token" | "url") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  const terminalUrl = typeof window === "undefined" ? `/kiosk/${token}` : new URL(`/kiosk/${token}`, window.location.origin).toString();
  return <div className="terminal-copy-actions">
    <button className="button button-secondary terminal-token-copy" type="button" onClick={() => copy(token, "token")}>{copied === "token" ? "Copied!" : "Copy token"}</button>
    <button className="button button-secondary terminal-token-copy" type="button" onClick={() => copy(terminalUrl, "url")}>{copied === "url" ? "URL copied!" : "Copy URL"}</button>
  </div>;
}
