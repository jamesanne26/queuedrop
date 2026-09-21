"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { DigitsOnlyInput } from "@/app/_components/digits-only-input";
import { deleteTeamMember, updateTeamMemberAccess, updateTeamMemberDetails } from "./actions";
import { TEAM_PERMISSION_FIELDS } from "./team-permissions";

type Branch = { id: string; name: string };
type Role = "manager" | "staff";
type BusinessRole = { id: string; name: string; base_role: "owner" | "admin" | "manager" | "staff"; branch_scope: "own_branch_only" | "selected_branches" | "all_branches"; is_system: boolean; is_protected: boolean };

type Props = {
  businessUserId: string;
  userId: string;
  memberName: string;
  email: string;
  phone: string;
  role: Role;
  businessRoleId: string;
  isActive: boolean;
  assignedBranchIds: string[];
  branches: Branch[];
  viewBranch: string;
  permissionValues: Record<string, boolean>;
  businessRoles: BusinessRole[];
};

function PasswordField({ name, minLength, placeholder }: { name: string; minLength: number; placeholder: string }) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <label className="team-field">
      New password <em>optional</em>
      <div className="password-input-wrap">
        <input name={name} type={showPassword ? "text" : "password"} minLength={minLength} maxLength={72} title="Use 6-72 characters." placeholder={placeholder} autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" />
        <button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"}>
          {showPassword ? "◉" : "○"}
        </button>
      </div>
      <small>Leave blank to keep the current password. Passwords require at least 6 characters.</small>
    </label>
  );
}

function ActionLoading() {
  return <div className="qd-loading-backdrop qd-team-action-loading" role="status" aria-live="polite" aria-label="Loading"><section className="qd-loading-modal"><div className="qd-loading-spinner" aria-hidden="true" /><strong>Please wait</strong></section></div>;
}

export function TeamMemberEditModal({
  businessUserId,
  userId,
  memberName,
  email,
  phone,
  role,
  businessRoleId,
  isActive: initialActive,
  assignedBranchIds,
  branches,
  viewBranch,
  permissionValues,
  businessRoles,
}: Props) {
  const initialRoleId = businessRoleId || businessRoles.find((item) => item.is_system && item.base_role === role)?.id || "";
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"details" | "permissions">("details");
  const [active, setActive] = useState(initialActive);
  const [permissionBranches, setPermissionBranches] = useState<string[]>(assignedBranchIds);
  const [selectedRoleId, setSelectedRoleId] = useState(initialRoleId);
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
    setTab("details");
    setConfirmUpdate(false);
    setDeletePrompt(false);
    setConfirmDelete(false);
    setDeleteName("");
  }

  function openModal() {
    setActive(initialActive);
    setPermissionBranches(assignedBranchIds);
    setSelectedRoleId(initialRoleId);
    setTab("details");
    setConfirmUpdate(false);
    setDeletePrompt(false);
    setConfirmDelete(false);
    setDeleteName("");
    setActionPending(false);
    setOpen(true);
  }

  const selectedBusinessRole = businessRoles.find((item) => item.id === selectedRoleId);
  const selectedBaseRole: Role = selectedBusinessRole?.base_role === "staff" ? "staff" : "manager";

  function changeRole(roleId: string) {
    setSelectedRoleId(roleId);
  }


  function requestUpdate(event: FormEvent<HTMLFormElement>) {
    if (confirmedUpdateSubmit.current) {
      confirmedUpdateSubmit.current = false;
      return;
    }
    event.preventDefault();
    setConfirmUpdate(true);
  }

  function confirmUpdateAndSubmit() {
    setConfirmUpdate(false);
    setActionPending(true);
    confirmedUpdateSubmit.current = true;
    const form = document.getElementById(updateFormId);
    if (form instanceof HTMLFormElement) form.requestSubmit();
  }

  function confirmDeleteAndSubmit() {
    setConfirmDelete(false);
    setDeletePrompt(false);
    setActionPending(true);
    const form = document.getElementById(deleteFormId);
    if (form instanceof HTMLFormElement) form.requestSubmit();
  }

  return (
    <>
      <button className="team-user-gear" type="button" onClick={openModal} aria-label={`Edit ${memberName}`} title="Edit user">⚙</button>

      {open ? (
        <div className="qd-modal-backdrop" role="presentation">
          <section className="qd-modal qd-team-edit-modal qd-team-edit-modal-v2" role="dialog" aria-modal="true" aria-labelledby={`edit-team-title-${userId}`}>
            <div className="qd-modal-header team-modal-header-v2">
              <div><p className="eyebrow">Team member</p><h2 id={`edit-team-title-${userId}`}>Edit user</h2></div>
              <button className="qd-modal-close" type="button" onClick={resetAndClose} aria-label="Close" disabled={actionPending}>×</button>
            </div>

            <div className="team-edit-tabs" role="tablist" aria-label="User edit sections">
              <button type="button" role="tab" aria-selected={tab === "details"} className={tab === "details" ? "team-edit-tab-active" : ""} onClick={() => setTab("details")}>User details</button>
              <button type="button" role="tab" aria-selected={tab === "permissions"} className={tab === "permissions" ? "team-edit-tab-active" : ""} onClick={() => setTab("permissions")}>Permissions</button>
            </div>

            {tab === "details" ? (
              <div className="team-edit-tab-panel">
                <form id={updateFormId} action={updateTeamMemberDetails} className="team-modal-form" onSubmit={requestUpdate} data-no-global-loading="true" autoComplete="off">
                  <input type="hidden" name="user_id" value={userId} />
                  <input type="hidden" name="view_branch" value={viewBranch} />
                  <input type="hidden" name="role" value={selectedBaseRole} />
                  <input type="hidden" name="is_active" value={String(active)} />
                  {permissionBranches.map((branchId) => <input key={branchId} type="hidden" name="branch_ids" value={branchId} />)}

                  <label className="team-field">Full name<input name="full_name" defaultValue={memberName} minLength={2} maxLength={100} required /></label>
                  <label className="team-field">Email <em>required</em><input name="email" type="email" defaultValue={email} required maxLength={254} spellCheck={false} /><small>Email is this user&apos;s QueueDrop login ID.</small></label>
                  <label className="team-field">Mobile <em>required</em><DigitsOnlyInput name="phone" defaultValue={phone} placeholder="09171234567" required /></label>
                  <label className="team-field">User role<select name="business_role_id" value={selectedRoleId} onChange={(event) => changeRole(event.target.value)} required><option value="" disabled>Choose role</option>{businessRoles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><small>The selected role controls this user’s access and branch scope.</small></label>
                  <label className="team-field">Access<select value={active ? "true" : "false"} onChange={(event) => setActive(event.target.value === "true")}><option value="true">Active</option><option value="false">Inactive</option></select></label>
                  <PasswordField name="new_password" minLength={6} placeholder="Leave blank to keep password" />

                  <div className="team-modal-actions team-modal-actions-v2"><button className="button button-secondary" type="button" onClick={resetAndClose} disabled={actionPending}>Cancel</button><button className="button button-primary" type="submit" disabled={actionPending}>Save details</button></div>
                </form>

                <form id={deleteFormId} action={deleteTeamMember} data-no-global-loading="true" className="team-delete-form-v2">
                  <input type="hidden" name="user_id" value={userId} />
                  <input type="hidden" name="view_branch" value={viewBranch} />
                  <input type="hidden" name="expected_name" value={memberName} />
                  <input type="hidden" name="confirmation_name" value={deleteName} />
                  <button className="button button-danger button-small" type="button" onClick={() => { setDeletePrompt(true); setDeleteName(""); }} disabled={actionPending}>Delete team member</button>
                </form>
              </div>
            ) : (
              <div className="team-edit-tab-panel">
                <form action={updateTeamMemberAccess} className="team-permissions-form-v2" data-no-global-loading="true" onSubmit={() => setActionPending(true)}>
                  <input type="hidden" name="business_user_id" value={businessUserId} />
                  <input type="hidden" name="user_id" value={userId} />
                  <input type="hidden" name="view_branch" value="all" />

                  <section className="team-permission-section-v2">
                    <div className="team-permission-section-heading"><strong>Branch access</strong><small>Branch access is managed from Settings → Branches → Branch Users.</small></div>
                    <div className="team-branch-access-list-v3">
                      {permissionBranches.length ? permissionBranches.map((branchId) => {
                        const branch = branches.find((item) => item.id === branchId);
                        return branch ? <div key={branchId} className="team-branch-access-chip-v3"><span className="team-branch-access-dot-v3" />{branch.name}</div> : null;
                      }) : <div className="team-branch-access-empty-v3">No branch assigned</div>}
                    </div>
                  </section>

                  <section className="team-permission-section-v2">
                    <div className="team-permission-section-heading"><strong>Permissions</strong><small>These permissions apply directly to this user.</small></div>
                    <div className="team-permission-edit-grid team-permission-edit-grid-v2">
                      {TEAM_PERMISSION_FIELDS.map((permission) => <label key={String(permission.key)}><input type="checkbox" name={String(permission.key)} defaultChecked={Boolean(permissionValues[String(permission.key)])} /><span>{permission.label}</span></label>)}
                    </div>
                  </section>

                  <div className="team-modal-actions team-modal-actions-v2"><button className="button button-secondary" type="button" onClick={resetAndClose} disabled={actionPending}>Cancel</button><button className="button button-primary" type="submit" disabled={actionPending}>Save permissions</button></div>
                </form>
              </div>
            )}

            {confirmUpdate ? <div className="qd-modal-backdrop qd-modal-nested-backdrop" role="presentation"><section className="qd-modal qd-confirm-modal" role="dialog" aria-modal="true"><div className="qd-confirm-icon">✓</div><div className="qd-confirm-copy"><h2>Save user details?</h2><p>Apply the updated details for {memberName}?</p></div><div className="qd-modal-actions"><button className="button button-secondary" type="button" onClick={() => setConfirmUpdate(false)}>Cancel</button><button className="button button-primary" type="button" onClick={confirmUpdateAndSubmit}>Yes, save</button></div></section></div> : null}

            {deletePrompt ? <div className="qd-modal-backdrop qd-modal-nested-backdrop" role="presentation"><section className="qd-modal qd-confirm-modal qd-delete-name-modal" role="dialog" aria-modal="true"><div className="qd-confirm-icon qd-confirm-icon-danger">!</div><div className="qd-confirm-copy"><h2>Delete team member</h2><p>Please type &quot;{memberName}&quot; to confirm deletion.</p></div><input className="qd-delete-name-input" value={deleteName} onChange={(event) => setDeleteName(event.target.value)} placeholder={memberName} autoFocus autoComplete="off" /><div className="qd-modal-actions"><button className="button button-secondary" type="button" onClick={() => { setDeletePrompt(false); setDeleteName(""); }}>Cancel</button><button className="button button-danger" type="button" disabled={deleteName !== memberName} onClick={() => { setDeletePrompt(false); setConfirmDelete(true); }}>Delete</button></div></section></div> : null}

            {confirmDelete ? <div className="qd-modal-backdrop qd-modal-nested-backdrop" role="presentation"><section className="qd-modal qd-confirm-modal" role="dialog" aria-modal="true"><div className="qd-confirm-icon qd-confirm-icon-danger">!</div><div className="qd-confirm-copy"><h2>Are you sure you want to delete?</h2><p>Delete {memberName} permanently from this QueueDrop business?</p></div><div className="qd-modal-actions"><button className="button button-secondary" type="button" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="button button-danger" type="button" onClick={confirmDeleteAndSubmit}>Yes, delete</button></div></section></div> : null}

            {actionPending ? <ActionLoading /> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
