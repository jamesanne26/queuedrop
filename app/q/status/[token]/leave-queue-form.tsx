"use client";

import { useState } from "react";
import { leaveQueue } from "./actions";

export function LeaveQueueForm({ token, exitCode }: { token: string; exitCode: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return <button className="button button-danger-outline" type="button" onClick={() => setOpen(true)}>Leave queue</button>;
  }

  return (
    <form action={leaveQueue} className="leave-queue-panel" onSubmit={(event) => {
      if (!window.confirm("Are you sure you want to leave the queue?")) event.preventDefault();
    }}>
      <input type="hidden" name="token" value={token} />
      <p><strong>Exit code: {exitCode}</strong></p>
      <p className="muted">Enter the 6-character code above to confirm that this is your queue ticket.</p>
      <label>6-character exit code<input name="exit_code" required minLength={6} maxLength={6} autoCapitalize="characters" autoComplete="off" /></label>
      <div className="qd-inline-actions">
        <button className="button button-secondary" type="button" onClick={() => setOpen(false)}>Keep my place</button>
        <button className="button button-danger-outline" type="submit">Confirm leave</button>
      </div>
    </form>
  );
}
