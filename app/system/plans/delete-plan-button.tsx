"use client";

import { useState } from "react";
import { deletePlan } from "./actions";

export function DeletePlanButton({ planId, planName }: { planId: string; planName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="button button-danger-outline" type="button" onClick={() => setOpen(true)}>Delete plan</button>
      {open ? (
        <div className="qd-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="qd-modal qd-confirm-modal" role="dialog" aria-modal="true" aria-labelledby={`delete-plan-${planId}`}>
            <div className="qd-confirm-icon qd-confirm-icon-danger" aria-hidden="true">!</div>
            <div className="qd-confirm-copy">
              <h2 id={`delete-plan-${planId}`}>Delete subscription plan?</h2>
              <p>Delete <strong>{planName}</strong> permanently? Active subscriptions or unfinished checkouts must be moved first. Historical billing records will be kept.</p>
            </div>
            <form action={deletePlan} className="qd-modal-actions">
              <input type="hidden" name="plan_id" value={planId} />
              <button className="button button-secondary" type="button" onClick={() => setOpen(false)}>Cancel</button>
              <button className="button button-danger" type="submit">Delete plan</button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
