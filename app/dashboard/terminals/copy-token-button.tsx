"use client";
import { useState } from "react";
export function CopyTokenButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(token); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { setCopied(false); }
  }
  return <div className="terminal-copy-actions"><button className="button button-secondary terminal-token-copy" type="button" onClick={copy}>{copied ? "Copied!" : "Copy token"}</button></div>;
}
