"use client";

import { useState } from "react";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  message?: string;
  disabled?: boolean;
  requireCode?: boolean;
  title?: string;
};

function makeCode() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return String(1000 + (value[0] % 9000));
  }
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function ConfirmDeleteSubmit({
  children,
  className = "button button-danger",
  message = "Are you sure you want to delete this item? This action cannot be undone.",
  disabled = false,
  requireCode = false,
  title = "Confirm deletion",
}: Props) {
  const [stage, setStage] = useState<"closed" | "confirm" | "verify">("closed");
  const [code, setCode] = useState("");
  const [input, setInput] = useState("");

  function close() {
    setStage("closed");
    setInput("");
  }

  function continueDelete() {
    if (!requireCode) return;
    setCode(makeCode());
    setInput("");
    setStage("verify");
  }

  return (
    <>
      <button className={className} type="button" onClick={() => setStage("confirm")} disabled={disabled}>{children}</button>

      {stage === "confirm" ? (
        <div className="qd-modal-backdrop qd-confirm-delete-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section className="qd-modal qd-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
            <div className="qd-confirm-icon qd-confirm-icon-danger">!</div>
            <div className="qd-confirm-copy">
              <h2 id="delete-confirm-title">{title}</h2>
              <p>{message}</p>
            </div>
            <div className="qd-modal-actions">
              <button className="button button-secondary" type="button" onClick={close}>No</button>
              {requireCode ? (
                <button className="button button-danger" type="button" onClick={continueDelete}>Yes, continue</button>
              ) : (
                <button className="button button-danger" type="submit">Yes</button>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {stage === "verify" ? (
        <div className="qd-modal-backdrop qd-delete-code-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section className="qd-modal qd-confirm-modal qd-delete-code-modal" role="dialog" aria-modal="true" aria-labelledby="delete-code-title">
            <div className="qd-confirm-icon qd-confirm-icon-danger">!</div>
            <div className="qd-confirm-copy">
              <h2 id="delete-code-title">Verification required</h2>
              <p>Type this verification code to confirm {title.toLowerCase()}:</p>
            </div>
            <div className="qd-delete-verification-code" aria-label="Verification code">{code}</div>
            <label className="qd-delete-code-field">
              <span>Verification code</span>
              <input value={input} onChange={(event) => setInput(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="off" maxLength={4} autoFocus />
            </label>
            <div className="qd-modal-actions">
              <button className="button button-secondary" type="button" onClick={close}>Cancel</button>
              <button className="button button-danger" type="submit" disabled={input !== code}>Confirm delete</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
