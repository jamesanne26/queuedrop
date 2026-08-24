"use client";

import { useEffect, useState } from "react";

type Props = {
  memberName: string;
};

export function DeleteMemberButton({ memberName }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.dataset.qdModalOpen = open ? "true" : "false";
    return () => {
      delete document.body.dataset.qdModalOpen;
    };
  }, [open]);

  return (
    <>
      <button
        className="button button-danger button-small"
        type="button"
        onClick={() => setOpen(true)}
      >
        Delete user
      </button>

      {open ? (
        <div className="qd-modal-backdrop" role="presentation">
          <section
            className="qd-modal qd-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-title"
          >
            <div className="qd-confirm-icon qd-confirm-icon-danger">!</div>
            <div className="qd-confirm-copy">
              <h2 id="delete-user-title">Delete {memberName}?</h2>
              <p>
                This removes the user&apos;s QueueDrop business access and may also
                delete their login account. Are you sure you want to continue?
              </p>
            </div>

            <div className="qd-modal-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                className="button button-danger"
                type="submit"
                onClick={() => {
                  setOpen(false);
                  document.body.dataset.qdModalOpen = "false";
                }}
              >
                Yes, delete user
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
