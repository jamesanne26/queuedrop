"use client";

import { useMemo, useState } from "react";
import { createTeamMember } from "./actions";
import { TeamCreateFields } from "./team-forms";
import { TeamMemberEditModal } from "./team-member-edit-modal";
import { TEAM_PERMISSION_FIELDS } from "./team-permissions";

type Role = "owner" | "admin" | "manager" | "staff";
type Member = {
  id: string; user_id: string; role: Role; role_id?: string | null; is_active: boolean; created_at: string; custom_role_name: string | null;
  can_set_branch_status: boolean; can_manage_services: boolean; can_manage_operating_hours: boolean; can_manage_team: boolean;
  can_manage_kiosk_display: boolean; can_call_customer: boolean;
  can_serve_customer: boolean; can_complete_ticket: boolean; can_cancel_ticket: boolean; can_mark_no_show: boolean;
  can_view_customer_contact: boolean; can_view_reports: boolean; can_export_reports: boolean; can_view_audit_logs: boolean;
  can_view_queue_information_editing: boolean; can_view_position_notifications: boolean;
  can_add_customer?: boolean; can_edit_customer?: boolean;
};
type Profile = { id: string; full_name: string | null; email: string | null; phone: string | null };
type Branch = { id: string; name: string; status: string };
type BranchUser = { user_id: string; branch_id: string };
type BusinessRole = { id: string; name: string; base_role: Role; branch_scope: "own_branch_only" | "selected_branches" | "all_branches"; is_system: boolean; is_protected: boolean };

type Props = {
  members: Member[];
  profiles: Profile[];
  branches: Branch[];
  assignments: BranchUser[];
  actorRole: Role;
  initialBranchId: string;
  businessRoles: BusinessRole[];
  lockBranch?: boolean;
  compact?: boolean;
};

function visibleEmail(email: string | null) {
  if (!email) return null;
  const normalized = email.toLowerCase();
  if (normalized.startsWith("phone-") && normalized.endsWith("@auth.queuedrop.invalid")) return null;
  return email;
}

export function TeamWorkspace({ members, profiles, branches, assignments, actorRole, initialBranchId, businessRoles, lockBranch = false, compact = false }: Props) {
  const isManager = actorRole === "manager";
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState(
    branches.some((branch) => branch.id === initialBranchId) ? initialBranchId : "all",
  );

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const branchById = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches]);
  const branchesByUser = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const assignment of assignments) {
      const list = map.get(assignment.user_id) ?? [];
      list.push(assignment.branch_id);
      map.set(assignment.user_id, list);
    }
    return map;
  }, [assignments]);

  const displayedMembers = selectedBranchId === "all"
    ? members
    : members.filter((member) => (branchesByUser.get(member.user_id) ?? []).includes(selectedBranchId));

  const activeBranches = branches.filter((branch) => branch.status === "active");

  function selectBranch(branchId: string) {
    setSelectedBranchId(branchId);
    const url = new URL(window.location.href);
    url.searchParams.set("branch", branchId);
    url.searchParams.delete("message");
    url.searchParams.delete("error");
    window.history.replaceState(window.history.state, "", `${url.pathname}?${url.searchParams.toString()}`);
  }

  function canManageMember(memberRole: Role) {
    if (isManager) return memberRole === "staff";
    return memberRole === "manager" || memberRole === "staff";
  }

  return (
    <section className={`dashboard-section dashboard-section-stack team-user-directory team-user-directory-v2 ${compact ? "team-user-directory-compact" : ""}`}>
      <div className="team-user-directory-header">
        <div className="team-user-directory-heading">
          <h2>Users</h2>
          <span className="team-user-count">{displayedMembers.length}</span>
          <p>Manage user details, roles, branch access and permissions.</p>
        </div>
        <button className="button button-primary team-add-user-button" type="button" onClick={() => setAddUserOpen((open) => !open)} aria-expanded={addUserOpen}>
          {addUserOpen ? "Close" : "+ Add User"}
        </button>
      </div>

      {!lockBranch ? (
        <div className="team-user-filter-row">
          <label className="responsive-branch-select">
            <span>Branch</span>
            <select value={selectedBranchId} onChange={(event) => selectBranch(event.target.value)} aria-label="Select branch">
              <option value="all">All branches</option>
              {branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <small>{selectedBranchId === "all" ? "Business-wide user list" : branchById.get(selectedBranchId)?.name ?? "Branch users"}</small>
        </div>
      ) : null}

      {addUserOpen ? (
        <div className="qd-modal-backdrop" role="presentation" data-testid="team-add-user-panel">
          <section className="qd-modal qd-team-add-modal" role="dialog" aria-modal="true" aria-labelledby="add-user-title">
            <div className="qd-modal-header">
              <div><p className="eyebrow">Users &amp; Access</p><h2 id="add-user-title">Add user</h2></div>
              <button className="qd-modal-close" type="button" aria-label="Close" onClick={() => setAddUserOpen(false)}>×</button>
            </div>
            <form action={createTeamMember} className="form-stack management-form team-add-user-popup-form" autoComplete="off" data-no-global-loading="true" data-lpignore="true" data-1p-ignore="true">
              <input type="hidden" name="view_branch" value={selectedBranchId} />
              <TeamCreateFields branches={activeBranches} managerMode={isManager} businessRoles={businessRoles} selectedBranchId={selectedBranchId} />
              <div className="team-add-user-actions">
                <button className="button button-secondary" type="button" onClick={() => setAddUserOpen(false)}>Cancel</button>
                <button className="button button-primary" type="submit">Create user</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <div className="team-user-table team-user-table-v2" role="table" aria-label="Business users">
        <div className="team-user-table-head team-user-table-head-v2" role="row">
          <span role="columnheader">Name</span>
          <span role="columnheader">Email</span>
          <span role="columnheader">User role</span>
          <span role="columnheader" aria-label="Actions" />
        </div>

        {displayedMembers.map((member) => {
          const profile = profileById.get(member.user_id);
          const assignedIds = branchesByUser.get(member.user_id) ?? [];
          const editable = canManageMember(member.role);
          const protectedRole = member.role === "owner" || member.role === "admin";
          const roleName = member.custom_role_name || member.role;
          const permissionValues = Object.fromEntries(TEAM_PERMISSION_FIELDS.map((permission) => [permission.key, Boolean(member[permission.key])])) as Record<string, boolean>;

          return (
            <article className="team-user-row team-user-row-v2" role="row" key={member.id}>
              <div className="team-user-primary" role="cell" data-label="Name">
                <span className={`team-avatar team-avatar-${member.role}`} aria-hidden="true">{(profile?.full_name ?? "T").slice(0, 1).toUpperCase()}</span>
                <span><strong>{profile?.full_name ?? "Team member"}</strong><small>{member.is_active ? "Active" : "Inactive"}</small></span>
              </div>
              <div role="cell" data-label="Email" className="team-user-email">{visibleEmail(profile?.email ?? null) ?? "No email"}</div>
              <div role="cell" data-label="User role"><span className="team-role-view">{protectedRole ? roleName : (() => { const assignedRole = businessRoles.find((item) => item.id === member.role_id); return assignedRole?.name ?? roleName; })()}</span></div>
              <div className="team-user-actions" role="cell" data-label="Actions">
                {protectedRole || !editable ? <span className="team-protected-mark" title="Protected account">Protected</span> : (
                  <TeamMemberEditModal
                    businessUserId={member.id}
                    userId={member.user_id}
                    memberName={profile?.full_name ?? "Team member"}
                    email={visibleEmail(profile?.email ?? null) ?? ""}
                    phone={profile?.phone ?? ""}
                    role={member.role as "manager" | "staff"}
                    businessRoleId={member.role_id ?? ""}
                    isActive={member.is_active}
                    assignedBranchIds={assignedIds}
                    branches={activeBranches.map((branch) => ({ id: branch.id, name: branch.name }))}
                    viewBranch={selectedBranchId}
                    permissionValues={permissionValues}
                    businessRoles={businessRoles.filter((item) => !isManager || item.base_role === "staff")}
                  />
                )}
              </div>
            </article>
          );
        })}

        {!displayedMembers.length ? <div className="mini-empty"><strong>No users here yet.</strong><span>Add a user or choose another branch.</span></div> : null}
      </div>
    </section>
  );
}
