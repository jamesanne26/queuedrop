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
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [input, setInput] = useState("");

  if (!requireCode) {
    return (
      <button className={className} type="submit" onClick={(event) => { if (!window.confirm(message)) event.preventDefault(); }} disabled={disabled}>
        {children}
      </button>
    );
  }

  function openVerification() {
    setCode(makeCode());
    setInput("");
    setOpen(true);
  }

  return (
    <>
      <button className={className} type="button" onClick={openVerification} disabled={disabled}>{children}</button>
      {open ? (
        <div className="qd-modal-backdrop qd-delete-code-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="qd-modal qd-confirm-modal qd-delete-code-modal" role="dialog" aria-modal="true" aria-labelledby="delete-code-title">
            <div className="qd-confirm-icon qd-confirm-icon-danger">!</div>
            <div className="qd-confirm-copy">
              <h2 id="delete-code-title">{title}</h2>
              <p>{message}</p>
              <p>Type this verification code to continue:</p>
            </div>
            <div className="qd-delete-verification-code" aria-label="Verification code">{code}</div>
            <label className="qd-delete-code-field">
              <span>Verification code</span>
              <input value={input} onChange={(event) => setInput(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="off" maxLength={4} autoFocus />
            </label>
            <div className="qd-modal-actions">
              <button className="button button-secondary" type="button" onClick={() => setOpen(false)}>Cancel</button>
              <button className="button button-danger" type="submit" disabled={input !== code}>Confirm delete</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
