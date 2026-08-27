"use client";

import { useRef, useState } from "react";
import { DigitsOnlyInput } from "@/app/_components/digits-only-input";
import { deleteTeamMember, updateTeamMemberDetails } from "./actions";

type Branch = { id: string; name: string };
type Role = "manager" | "staff";

type Props = {
  userId: string;
  memberName: string;
  email: string;
  phone: string;
  role: Role;
  isActive: boolean;
  assignedBranchIds: string[];
  branches: Branch[];
  managerMode: boolean;
  viewBranch: string;
};

function PasswordField({
  name,
  minLength,
  placeholder,
  managerPassword,
}: {
  name: string;
  minLength: number;
  placeholder: string;
  managerPassword: boolean;
  optional?: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <label className="team-field">
      New password <em>optional</em>
      <div className="password-input-wrap">
        <input
          name={name}
          type={showPassword ? "text" : "password"}
          minLength={minLength}
          maxLength={72}
          pattern={
            managerPassword
              ? "(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{10,72}"
              : undefined
          }
          title={
            managerPassword
              ? "Use 10-72 characters with uppercase, lowercase, number, and symbol."
              : "Use at least 6 characters."
          }
          placeholder={placeholder}
          autoComplete="new-password"
          data-lpignore="true"
          data-1p-ignore="true"
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setShowPassword((current) => !current)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          title={showPassword ? "Hide password" : "Show password"}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            className="password-toggle-icon"
          >
            {showPassword ? (
              <>
                <path d="M2.8 12s3.3-6 9.2-6c5.9 0 9.2 6 9.2 6s-3.3 6-9.2 6c-5.9 0-9.2-6-9.2-6Z" />
                <circle cx="12" cy="12" r="2.7" />
              </>
            ) : (
              <>
                <path d="M3 3l18 18" />
                <path d="M10.6 5.9A9.6 9.6 0 0 1 12 5.8c5.9 0 9.2 6.2 9.2 6.2a17.4 17.4 0 0 1-3.1 3.7" />
                <path d="M6.1 7.3C3.8 9 2.8 12 2.8 12s3.3 6 9.2 6a9.8 9.8 0 0 0 3.3-.6" />
              </>
            )}
          </svg>
        </button>
      </div>
      <small>
        Current passwords cannot be retrieved. Leave this blank to keep the existing password, or enter a new one to change it.
        {managerPassword
          ? " Manager passwords require 10+ characters with uppercase, lowercase, number, and symbol."
          : " Staff passwords require at least 6 characters."}
      </small>
      {managerPassword ? (
        <a className="team-forgot-password" href="/auth/forgot-password">
          Forgot password?
        </a>
      ) : null}
    </label>
  );
}

function ActionLoading() {
  return (
    <div className="qd-loading-backdrop qd-team-action-loading" role="status" aria-live="polite" aria-label="Loading">
      <section className="qd-loading-modal">
        <div className="qd-loading-spinner" aria-hidden="true" />
        <strong>Please wait</strong>
      </section>
    </div>
  );
}

export function TeamMemberEditModal({
  userId,
  memberName,
  email,
  phone,
  role: initialRole,
  isActive: initialActive,
  assignedBranchIds,
  branches,
  managerMode,
  viewBranch,
}: Props) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>(initialRole);
  const [active, setActive] = useState(initialActive);
  const [selectedBranches, setSelectedBranches] = useState<string[]>(assignedBranchIds);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [deletePrompt, setDeletePrompt] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const updateFormId = `team-update-${userId}`;
  const deleteFormId = `team-delete-${userId}`;
  const confirmedUpdateSubmit = useRef(false);

  function resetAndClose() {
    if (actionPending) return;
    setOpen(false);
    setConfirmUpdate(false);
    setDeletePrompt(false);
    setConfirmDelete(false);
    setDeleteName("");
  }

  function openModal() {
    setRole(initialRole);
    setActive(initialActive);
    setSelectedBranches(assignedBranchIds);
    setConfirmUpdate(false);
    setDeletePrompt(false);
    setConfirmDelete(false);
    setDeleteName("");
    setActionPending(false);
    setOpen(true);
  }

  function toggleBranch(branchId: string) {
    setSelectedBranches((current) =>
      current.includes(branchId)
        ? current.filter((id) => id !== branchId)
        : [...current, branchId],
    );
  }

  function requestUpdate(event: React.FormEvent<HTMLFormElement>) {
    if (confirmedUpdateSubmit.current) {
      confirmedUpdateSubmit.current = false;
      return;
    }
    event.preventDefault();
    setConfirmUpdate(true);
  }

  function startDelete() {
    setDeletePrompt(true);
    setConfirmUpdate(false);
    setDeleteName("");
  }

  function confirmUpdateAndSubmit() {
    setConfirmUpdate(false);
    setDeletePrompt(false);
    setConfirmDelete(false);
    setActionPending(true);
    confirmedUpdateSubmit.current = true;
    const form = document.getElementById(updateFormId);
    if (form instanceof HTMLFormElement) form.requestSubmit();
  }

  function confirmDeleteAndSubmit() {
    setConfirmDelete(false);
    setDeletePrompt(false);
    setConfirmUpdate(false);
    setActionPending(true);
    const form = document.getElementById(deleteFormId);
    if (form instanceof HTMLFormElement) form.requestSubmit();
  }

  return (
    <>
      <button className="button button-primary button-small" type="button" onClick={openModal}>
        Edit details
      </button>

      {open ? (
        <div className="qd-modal-backdrop" role="presentation">
          <section className="qd-modal qd-team-edit-modal" role="dialog" aria-modal="true" aria-labelledby={`edit-team-title-${userId}`}>
            <div className="qd-modal-header">
              <div>
                <p className="eyebrow">Team member</p>
                <h2 id={`edit-team-title-${userId}`}>Edit details</h2>
              </div>
              <button className="qd-modal-close" type="button" onClick={resetAndClose} aria-label="Close" disabled={actionPending}>×</button>
            </div>

            <form
              id={updateFormId}
              action={updateTeamMemberDetails}
              className="team-modal-form"
              onSubmit={requestUpdate}
              data-no-global-loading="true"
              autoComplete="off"
            >
              <input type="hidden" name="user_id" value={userId} />
              <input type="hidden" name="view_branch" value={viewBranch} />
              <input type="hidden" name="role" value={role} />
              <input type="hidden" name="is_active" value={String(active)} />
              {selectedBranches.map((branchId) => (
                <input key={branchId} type="hidden" name="branch_ids" value={branchId} />
              ))}

              <label className="team-field">
                Full name
                <input name="full_name" defaultValue={memberName} minLength={2} maxLength={100} placeholder="Maria Santos" required />
              </label>

              <label className="team-field">
                Email <em>{role === "staff" ? "optional" : "required"}</em>
                <input name="email" type="email" defaultValue={email} required={role === "manager"} maxLength={254} spellCheck={false} />
              </label>

              <label className="team-field">
                Mobile <em>required</em>
                <DigitsOnlyInput name="phone" defaultValue={phone} placeholder="09171234567" required />
              </label>

              <label className="team-field">
                Role
                {managerMode ? (
                  <input value="Staff" disabled />
                ) : (
                  <select value={role} onChange={(event) => {
                    const nextRole = event.target.value as Role;
                    setRole(nextRole);
                    if (nextRole === "staff") {
                      setSelectedBranches((current) => current.length ? [current[0]] : []);
                    }
                  }}>
                    <option value="manager">Manager</option>
                    <option value="staff">Staff</option>
                  </select>
                )}
              </label>

              {role === "staff" ? (
                <label className="team-field">
                  Branch
                  <select value={selectedBranches[0] ?? ""} onChange={(event) => setSelectedBranches(event.target.value ? [event.target.value] : [])} required>
                    <option value="" disabled>Select one branch</option>
                    {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                  <small>Staff can belong to one branch only.</small>
                </label>
              ) : (
                <fieldset className="branch-checkboxes team-modal-branches">
                  <legend>Branch <small>select at least one</small></legend>
                  {branches.map((branch) => (
                    <label key={branch.id}>
                      <input type="checkbox" checked={selectedBranches.includes(branch.id)} onChange={() => toggleBranch(branch.id)} />
                      <span>{branch.name}</span>
                    </label>
                  ))}
                </fieldset>
              )}

              <label className="team-field">
                Access
                <select value={active ? "true" : "false"} onChange={(event) => setActive(event.target.value === "true")}>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </label>

              <PasswordField
                name="new_password"
                minLength={role === "staff" ? 6 : 10}
                managerPassword={role === "manager"}
                placeholder={role === "staff" ? "Leave blank to keep password" : "Leave blank to keep password"}
              />

              <div className="team-modal-actions">
                <button className="button button-secondary" type="button" onClick={resetAndClose} disabled={actionPending}>Cancel</button>
                <button className="button button-primary" type="submit" disabled={actionPending}>Save changes</button>
              </div>
            </form>

            <form id={deleteFormId} action={deleteTeamMember} data-no-global-loading="true">
              <input type="hidden" name="user_id" value={userId} />
              <input type="hidden" name="view_branch" value={viewBranch} />
              <input type="hidden" name="expected_name" value={memberName} />
              <input type="hidden" name="confirmation_name" value={deleteName} />
              <button className="button button-danger button-small team-modal-delete" type="button" onClick={startDelete} disabled={actionPending}>Delete team member</button>
            </form>

            {confirmUpdate ? (
              <div className="qd-modal-backdrop qd-modal-nested-backdrop" role="presentation">
                <section className="qd-modal qd-confirm-modal" role="dialog" aria-modal="true">
                  <div className="qd-confirm-icon">✓</div>
                  <div className="qd-confirm-copy">
                    <h2>Are you sure you want to update?</h2>
                    <p>Save the updated details for {memberName}?</p>
                  </div>
                  <div className="qd-modal-actions">
                    <button className="button button-secondary" type="button" onClick={() => setConfirmUpdate(false)}>Cancel</button>
                    <button className="button button-primary" type="button" onClick={confirmUpdateAndSubmit}>Yes, update</button>
                  </div>
                </section>
              </div>
            ) : null}

            {deletePrompt ? (
              <div className="qd-modal-backdrop qd-modal-nested-backdrop" role="presentation">
                <section className="qd-modal qd-confirm-modal qd-delete-name-modal" role="dialog" aria-modal="true">
                  <div className="qd-confirm-icon qd-confirm-icon-danger">!</div>
                  <div className="qd-confirm-copy">
                    <h2>Delete team member</h2>
                    <p>Please type &quot;{memberName}&quot; to confirm deletion.</p>
                  </div>
                  <input className="qd-delete-name-input" value={deleteName} onChange={(event) => setDeleteName(event.target.value)} placeholder={memberName} autoFocus autoComplete="off" />
                  <div className="qd-modal-actions">
                    <button className="button button-secondary" type="button" onClick={() => { setDeletePrompt(false); setDeleteName(""); }}>Cancel</button>
                    <button className="button button-danger" type="button" disabled={deleteName !== memberName} onClick={() => { setDeletePrompt(false); setConfirmDelete(true); }}>Delete</button>
                  </div>
                </section>
              </div>
            ) : null}

            {confirmDelete ? (
              <div className="qd-modal-backdrop qd-modal-nested-backdrop" role="presentation">
                <section className="qd-modal qd-confirm-modal" role="dialog" aria-modal="true">
                  <div className="qd-confirm-icon qd-confirm-icon-danger">!</div>
                  <div className="qd-confirm-copy">
                    <h2>Are you sure you want to delete?</h2>
                    <p>Delete {memberName} permanently from this QueueDrop business?</p>
                  </div>
                  <div className="qd-modal-actions">
                    <button className="button button-secondary" type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
                    <button className="button button-danger" type="button" onClick={confirmDeleteAndSubmit}>Yes, delete</button>
                  </div>
                </section>
              </div>
            ) : null}

            {actionPending ? <ActionLoading /> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
