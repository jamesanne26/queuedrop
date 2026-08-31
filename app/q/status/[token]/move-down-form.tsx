"use client";

import { useState } from "react";
import { moveDownOnePlace } from "./actions";

export function MoveDownForm({ token, confirmationCode, compact = false }: { token: string; confirmationCode: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className={`button button-secondary customer-move-down-button${compact ? " customer-move-down-button-compact" : ""}`} type="button" onClick={() => setOpen(true)}>
        Move down 1 place
      </button>
    );
  }

  const form = (
    <form
      action={moveDownOnePlace}
      className="leave-queue-panel customer-move-down-panel"
      onSubmit={(event) => {
        if (!window.confirm("Are you sure you want to move down one place and let the customer behind you go ahead?")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="token" value={token} />
      <p><strong>Confirmation code: {confirmationCode}</strong></p>
      <p className="muted">This will move you down exactly one position and move the customer directly behind you ahead by one position.</p>
      <label>
        Enter the 6-character code
        <input name="confirmation_code" required minLength={6} maxLength={6} autoCapitalize="characters" autoComplete="off" />
      </label>
      <div className="qd-inline-actions">
        <button className="button button-secondary" type="button" onClick={() => setOpen(false)}>Keep my position</button>
        <button className="button button-primary" type="submit">Confirm move down</button>
      </div>
    </form>
  );

  if (!compact) return form;

  return (
    <div className="customer-move-down-modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <div className="customer-move-down-modal" role="dialog" aria-modal="true" aria-label="Move down one place" onMouseDown={(event) => event.stopPropagation()}>
        {form}
      </div>
    </div>
  );
}
