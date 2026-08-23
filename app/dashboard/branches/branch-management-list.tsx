"use client";

import { useEffect, useState } from "react";
import { deleteBranch, updateBranch } from "./actions";

type BranchRow = {
  id: string;
  name: string;
  status: string;
  address: string | null;
  phone: string | null;
  queueSummary: string;
};

type Props = {
  branches: BranchRow[];
  canManage: boolean;
};

type Modal = null | { kind: "edit"; branch: BranchRow } | { kind: "delete"; branch: BranchRow };

export function BranchManagementList({ branches, canManage }: Props) {
  const [modal, setModal] = useState<Modal>(null);

  useEffect(() => {
    document.body.dataset.qdModalOpen = modal ? "true" : "false";
    return () => { delete document.body.dataset.qdModalOpen; };
  }, [modal]);

  return (
    <>
      <div className="branch-list">
        {branches.map((branch) => (
          <article className="branch-row branch-row-rich branch-row-manageable" key={branch.id}>
            <div>
              <strong>{branch.name}</strong>
              <span>{branch.address || "No address added"}</span>
              <span className="detail-line">{branch.queueSummary}</span>
            </div>
            <div className="branch-meta">
              <span>{branch.phone || "No contact number"}</span>
              <span className={branch.status === "active" ? "status-chip" : "status-chip status-chip-off"}>{branch.status}</span>
              {canManage ? (
                <div className="branch-action-row">
                  <button className="button button-secondary button-small" type="button" onClick={() => setModal({ kind: "edit", branch })}>Edit</button>
                  <button className="button button-danger-outline button-small" type="button" onClick={() => setModal({ kind: "delete", branch })}>Delete</button>
                </div>
              ) : null}
            </div>
          </article>
        ))}

        {!branches.length ? (
          <div className="mini-empty"><strong>No branch assignment.</strong><span>Ask a business owner/admin to assign this account to a branch.</span></div>
        ) : null}
      </div>

      {modal?.kind === "edit" ? (
        <div className="qd-modal-backdrop" role="presentation">
          <section className="qd-modal" role="dialog" aria-modal="true" aria-labelledby="edit-branch-title">
            <div className="qd-modal-header">
              <div><p className="eyebrow">Branch management</p><h2 id="edit-branch-title">Edit branch</h2></div>
            </div>
            <form action={updateBranch} className="form-stack">
              <input type="hidden" name="branch_id" value={modal.branch.id} />
              <label>Branch name<input name="name" required minLength={2} maxLength={120} defaultValue={modal.branch.name} /></label>
              <label>Address <em>optional</em><input name="address" maxLength={300} defaultValue={modal.branch.address ?? ""} /></label>
              <label>Contact number <em>optional</em><input name="phone" maxLength={32} defaultValue={modal.branch.phone ?? ""} placeholder="09171234567" /></label>
              <label>Status<select name="status" defaultValue={modal.branch.status}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
              <div className="qd-modal-actions">
                <button className="button button-secondary" type="button" onClick={() => setModal(null)}>Cancel</button>
                <button className="button button-primary" type="submit">Save branch</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {modal?.kind === "delete" ? (
        <div className="qd-modal-backdrop" role="presentation">
          <section className="qd-modal qd-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-branch-title">
            <div className="qd-confirm-icon qd-confirm-icon-danger">!</div>
            <div className="qd-confirm-copy">
              <h2 id="delete-branch-title">Delete {modal.branch.name}?</h2>
              <p>Are you sure you want to delete this branch? Branches with queue history are protected and cannot be deleted.</p>
            </div>
            <form action={deleteBranch} className="qd-modal-actions">
              <input type="hidden" name="branch_id" value={modal.branch.id} />
              <button className="button button-secondary" type="button" onClick={() => setModal(null)}>Cancel</button>
              <button className="button button-danger" type="submit">Yes, delete branch</button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
