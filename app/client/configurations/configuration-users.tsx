"use client";

import { useMemo, useState } from "react";
import { deleteClientUser, updateClientUserSettings } from "./actions";

type Role = "owner" | "admin" | "manager" | "staff";

type Branch = {
  id: string;
  name: string;
};

export type ConfigurationUser = {
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  role: Role;
  roleName: string;
  isActive: boolean;
  branchIds: string[];
  canViewQueueInformationEditing: boolean;
  canViewPositionNotifications: boolean;
  canSetBranchStatus: boolean;
  canManageServices: boolean;
  canManageOperatingHours: boolean;
  canManageTeam: boolean;
  canManageKioskDisplay: boolean;
  canAddCustomer: boolean;
  canEditCustomer: boolean;
  canCallCustomer: boolean;
  canServeCustomer: boolean;
  canCompleteTicket: boolean;
  canCancelTicket: boolean;
  canMarkNoShow: boolean;
  canViewCustomerContact: boolean;
  canViewReports: boolean;
  canExportReports: boolean;
  canViewAuditLogs: boolean;
  isCurrentUser: boolean;
};

function roleLabel(role: Role) {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  if (role === "manager") return "Manager";
  return "Staff";
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.07-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.1 7.1 0 0 0-1.62-.94L14.38 2.8a.5.5 0 0 0-.49-.4h-3.84a.5.5 0 0 0-.49.4L9.2 5.32c-.58.24-1.12.56-1.62.94L5.2 5.3a.5.5 0 0 0-.61.22L2.67 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.05.31-.08.64-.08.96 0 .31.03.62.07.92L2.8 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.37-.95c.5.39 1.05.71 1.64.95l.36 2.5a.5.5 0 0 0 .49.4h3.84a.5.5 0 0 0 .49-.4l.36-2.5c.59-.24 1.14-.56 1.64-.95l2.37.95a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.04-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" />
    </svg>
  );
}

export function ConfigurationUsers({
  users,
  branches,
}: {
  users: ConfigurationUser[];
  branches: Branch[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [role, setRole] = useState<Role>("staff");

  const selected = useMemo(
    () => users.find((user) => user.userId === selectedId) ?? null,
    [selectedId, users],
  );

  const openSettings = (user: ConfigurationUser) => {
    setRole(user.role);
    setDeleteOpen(false);
    setSelectedId(user.userId);
  };

  const closeSettings = () => {
    setDeleteOpen(false);
    setSelectedId(null);
  };

  return (
    <>
      <div className="client-config-table-wrap">
        <table className="client-config-table client-users-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Queue information editing</th>
              <th>Position notifications</th>
              <th>Allow branch active / inactive</th>
              <th aria-label="User settings" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const alwaysAllowed = user.role === "owner" || user.role === "admin";
              return (
                <tr key={user.userId}>
                  <td data-label="Name">{user.fullName || "Team member"}</td>
                  <td data-label="Email">{user.email || "No email"}</td>
                  <td data-label="Role" className="client-role-cell">{user.roleName || roleLabel(user.role)}</td>
                  <td data-label="Queue information editing">{alwaysAllowed || user.canViewQueueInformationEditing ? "Yes" : "No"}</td>
                  <td data-label="Position notifications">{alwaysAllowed || user.canViewPositionNotifications ? "Yes" : "No"}</td>
                  <td data-label="Allow branch active / inactive">{alwaysAllowed || user.canSetBranchStatus ? "Yes" : "No"}</td>
                  <td data-label="Settings" className="client-user-settings-cell">
                    <button
                      type="button"
                      className="client-settings-icon-button"
                      aria-label={`Open settings for ${user.fullName || "team member"}`}
                      title="User settings"
                      onClick={() => openSettings(user)}
                    >
                      <SettingsIcon />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="qd-modal-backdrop client-user-modal-backdrop" role="presentation" onMouseDown={closeSettings}>
          <section
            className="qd-modal client-user-settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-user-settings-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="qd-modal-header client-user-modal-header">
              <div>
                <span>User settings</span>
                <h2 id="client-user-settings-title">{selected.fullName || "Team member"}</h2>
              </div>
              <button type="button" className="qd-modal-close" onClick={closeSettings} aria-label="Close user settings">×</button>
            </div>

            <form action={updateClientUserSettings} className="client-user-settings-form">
              <input type="hidden" name="user_id" value={selected.userId} />
              <input type="hidden" name="original_role" value={selected.role} />

              <div className="client-user-form-grid">
                <label className="form-field">
                  <span>Full name</span>
                  <input name="full_name" type="text" defaultValue={selected.fullName} minLength={2} maxLength={100} required />
                </label>

                <label className="form-field">
                  <span>Email</span>
                  <input
                    name="email"
                    type="email"
                    defaultValue={selected.email}
                    maxLength={254}
                    required={role === "manager" || role === "owner" || role === "admin"}
                  />
                  {role === "staff" ? <small className="muted">Optional for staff.</small> : null}
                </label>

                <label className="form-field">
                  <span>Mobile</span>
                  <input
                    name="phone"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]+"
                    defaultValue={selected.phone}
                    required={role === "manager" || role === "staff"}
                  />
                  <small className="muted">Numbers only.</small>
                </label>

                <label className="form-field">
                  <span>Declared role</span>
                  <input type="hidden" name="role" value={selected.role} />
                  <input value={selected.roleName || roleLabel(selected.role)} readOnly disabled />
                  <small className="muted">Change role names and role assignments from Dashboard → Team & Roles.</small>
                </label>

                {selected.role === "owner" || selected.role === "admin" ? (
                  <label className="form-field">
                    <span>Account status</span>
                    <input value={selected.isActive ? "Active" : "Inactive"} readOnly disabled />
                    <input type="hidden" name="is_active" value={selected.isActive ? "true" : "false"} />
                  </label>
                ) : (
                  <label className="form-field">
                    <span>Account status</span>
                    <select name="is_active" defaultValue={selected.isActive ? "true" : "false"}>
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </label>
                )}

                {selected.role === "owner" || selected.role === "admin" ? null : (
                  <label className="form-field client-password-field">
                    <span>New password</span>
                    <input name="new_password" type="password" minLength={6} maxLength={72} autoComplete="new-password" placeholder="At least 6 characters" />
                    <small className="muted">Leave blank to keep the current password. Use 6-72 characters.</small>
                  </label>
                )}
              </div>

              {selected.role === "owner" || selected.role === "admin" ? (
                <div className="client-user-section">
                  <h3>Branch access</h3>
                  <p className="muted">Owner and Admin accounts have business-wide access.</p>
                </div>
              ) : (
                <fieldset className="client-user-section">
                  <legend>Branch assignment</legend>
                  <p className="muted">
                    {role === "staff" ? "Staff must be assigned to exactly one branch." : "Managers must have at least one branch."}
                  </p>
                  <div className="client-branch-check-grid">
                    {branches.map((branch) => (
                      <label key={branch.id}>
                        <input
                          type={role === "staff" ? "radio" : "checkbox"}
                          name="branch_ids"
                          value={branch.id}
                          defaultChecked={selected.branchIds.includes(branch.id)}
                          required={role === "staff"}
                        />
                        <span>{branch.name}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              <fieldset className="client-user-section">
                <legend>Access & permissions</legend>
                {selected.role === "owner" || selected.role === "admin" ? (
                  <p className="muted">Owner and Admin have business-wide operational access. Sensitive ownership and billing actions remain Owner-only.</p>
                ) : (
                  <>
                    <p className="muted">Permissions are limited by role. Staff cannot be granted Manager-level administration permissions.</p>
                    <div className="client-permission-groups">
                      <section>
                        <h4>Queue operations</h4>
                        <div className="client-permission-check-grid">
                          <label><input type="checkbox" name="add_customer" defaultChecked={selected.canAddCustomer} /><span>Add customer / ticket</span></label>
                          <label><input type="checkbox" name="edit_customer" defaultChecked={selected.canEditCustomer} /><span>Edit customer information</span></label>
                          <label><input type="checkbox" name="call_customer" defaultChecked={selected.canCallCustomer} /><span>Call customer</span></label>
                          <label><input type="checkbox" name="serve_customer" defaultChecked={selected.canServeCustomer} /><span>Start serving</span></label>
                          <label><input type="checkbox" name="complete_ticket" defaultChecked={selected.canCompleteTicket} /><span>Complete ticket</span></label>
                          <label><input type="checkbox" name="cancel_ticket" defaultChecked={selected.canCancelTicket} /><span>Cancel ticket</span></label>
                          <label><input type="checkbox" name="mark_no_show" defaultChecked={selected.canMarkNoShow} /><span>Mark no-show</span></label>
                          <label><input type="checkbox" name="view_customer_contact" defaultChecked={selected.canViewCustomerContact} /><span>View customer mobile/contact</span></label>
                        </div>
                      </section>

                      {role === "manager" ? (
                        <>
                          <section>
                            <h4>Location & services</h4>
                            <div className="client-permission-check-grid">
                              <label><input type="checkbox" name="branch_status" defaultChecked={selected.canSetBranchStatus} /><span>Set assigned location active / inactive</span></label>
                              <label><input type="checkbox" name="manage_services" defaultChecked={selected.canManageServices} /><span>Manage services</span></label>
                              <label><input type="checkbox" name="manage_operating_hours" defaultChecked={selected.canManageOperatingHours} /><span>Manage operating hours</span></label>
                              <label><input type="checkbox" name="manage_kiosk_display" defaultChecked={selected.canManageKioskDisplay} /><span>Manage kiosk / display settings</span></label>
                            </div>
                          </section>
                          <section>
                            <h4>Queue configuration</h4>
                            <div className="client-permission-check-grid">
                              <label><input type="checkbox" name="queue_information_editing" defaultChecked={selected.canViewQueueInformationEditing} /><span>Queue information editing</span></label>
                              <label><input type="checkbox" name="position_notifications" defaultChecked={selected.canViewPositionNotifications} /><span>Position notifications</span></label>
                            </div>
                          </section>
                          <section>
                            <h4>Team</h4>
                            <div className="client-permission-check-grid">
                              <label><input type="checkbox" name="manage_team" defaultChecked={selected.canManageTeam} /><span>Manage Staff in assigned locations</span></label>
                            </div>
                          </section>
                          <section>
                            <h4>Reports & data</h4>
                            <div className="client-permission-check-grid">
                              <label><input type="checkbox" name="view_reports" defaultChecked={selected.canViewReports} /><span>View assigned-location reports</span></label>
                              <label><input type="checkbox" name="export_reports" defaultChecked={selected.canExportReports} /><span>Export assigned-location reports</span></label>
                              <label className="permission-disabled"><input type="checkbox" disabled checked={false} readOnly /><span>View audit logs (Owner/Admin only)</span></label>
                            </div>
                          </section>
                        </>
                      ) : null}
                    </div>
                  </>
                )}
              </fieldset>

              <div className="client-user-modal-actions">
                <div>
                  {selected.role === "owner" || selected.role === "admin" || selected.isCurrentUser ? (
                    <span className="muted client-protected-note">
                      {selected.isCurrentUser ? "You cannot delete your own account." : "Owner and Admin accounts are protected from deletion."}
                    </span>
                  ) : (
                    <button type="button" className="button client-delete-user-button" onClick={() => setDeleteOpen(true)}>
                      Delete user
                    </button>
                  )}
                </div>
                <div className="client-user-save-actions">
                  <button type="button" className="button button-secondary" onClick={closeSettings}>Cancel</button>
                  <button type="submit" className="button button-primary">Save changes</button>
                </div>
              </div>
            </form>

            {deleteOpen ? (
              <div className="qd-modal-nested-backdrop client-delete-confirm-backdrop" role="presentation" onMouseDown={() => setDeleteOpen(false)}>
                <section className="qd-confirm-modal client-delete-confirm-modal" role="alertdialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
                  <h3>Delete {selected.fullName || "this user"}?</h3>
                  <p>This removes the user from this business and their assigned branches. This cannot be undone from this screen.</p>
                  <form action={deleteClientUser}>
                    <input type="hidden" name="user_id" value={selected.userId} />
                    <input type="hidden" name="expected_name" value={selected.fullName} />
                    <label className="form-field">
                      <span>Type the full name to confirm</span>
                      <input name="confirmation_name" autoComplete="off" required />
                    </label>
                    <div className="qd-modal-actions">
                      <button type="button" className="button button-secondary" onClick={() => setDeleteOpen(false)}>Cancel</button>
                      <button type="submit" className="button client-delete-user-button">Delete user</button>
                    </div>
                  </form>
                </section>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
