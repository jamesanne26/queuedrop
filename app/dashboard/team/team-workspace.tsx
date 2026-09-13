"use client";

import { useMemo, useState } from "react";
import { assignBusinessRoleToEmployee, createTeamMember } from "./actions";
import { TeamCreateFields } from "./team-forms";
import { TeamMemberEditModal } from "./team-member-edit-modal";

type Role = "owner" | "admin" | "manager" | "staff";
type Member = {
  id: string; user_id: string; role: Role; role_id?: string | null; is_active: boolean; created_at: string; custom_role_name: string | null;
  can_set_branch_status: boolean; can_manage_services: boolean; can_manage_operating_hours: boolean; can_manage_team: boolean;
  can_manage_kiosk_display: boolean; can_call_customer: boolean;
  can_serve_customer: boolean; can_complete_ticket: boolean; can_cancel_ticket: boolean; can_mark_no_show: boolean;
  can_view_customer_contact: boolean; can_view_reports: boolean; can_export_reports: boolean; can_view_audit_logs: boolean;
  can_view_queue_information_editing: boolean; can_view_position_notifications: boolean;
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
};

function visibleEmail(email: string | null) {
  if (!email) return null;
  const normalized = email.toLowerCase();
  if (normalized.startsWith("phone-") && normalized.endsWith("@auth.queuedrop.invalid")) return null;
  return email;
}

export function TeamWorkspace({ members, profiles, branches, assignments, actorRole, initialBranchId, businessRoles }: Props) {
  const isManager = actorRole === "manager";
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

  const memberCountByBranch = useMemo(() => {
    const counts = new Map<string, number>();
    for (const branch of branches) counts.set(branch.id, 0);
    for (const member of members) {
      for (const branchId of branchesByUser.get(member.user_id) ?? []) {
        counts.set(branchId, (counts.get(branchId) ?? 0) + 1);
      }
    }
    return counts;
  }, [branches, branchesByUser, members]);

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
    <>
      <section className="dashboard-section team-branch-tabs-card team-users-toolbar">
        <label className="responsive-branch-select">
          <span>Branch</span>
          <select value={selectedBranchId} onChange={(event) => selectBranch(event.target.value)} aria-label="Select branch">
            <option value="all">All branches</option>
            {branches.map((branch) => (
              <option value={branch.id} key={branch.id}>{branch.name} - {memberCountByBranch.get(branch.id) ?? 0} users</option>
            ))}
          </select>
        </label>
        <div className="team-users-toolbar-copy">
          <strong>{displayedMembers.length} user{displayedMembers.length === 1 ? "" : "s"}</strong>
          <span>{selectedBranchId === "all" ? "Business-wide user list" : branchById.get(selectedBranchId)?.name ?? "Branch users"}</span>
        </div>
      </section>

      <section className="dashboard-section dashboard-section-stack team-user-directory">
        <div className="section-row">
          <div>
            <p className="eyebrow">Users & access</p>
            <h2>User setup</h2>
            <p className="muted">Default role controls the user&apos;s baseline access. The permission columns give a quick view; use the gear to edit details, password, branch assignments, status, or delete the user.</p>
          </div>
        </div>

        <div className="team-user-table" role="table" aria-label="Business users">
          <div className="team-user-table-head" role="row">
            <span role="columnheader">Name</span>
            <span role="columnheader">Email</span>
            <span role="columnheader">Default role</span>
            <span role="columnheader">Queue edit</span>
            <span role="columnheader">Call</span>
            <span role="columnheader">Complete</span>
            <span role="columnheader" aria-label="Actions" />
          </div>

          {displayedMembers.map((member) => {
            const profile = profileById.get(member.user_id);
            const assignedIds = branchesByUser.get(member.user_id) ?? [];
            const editable = canManageMember(member.role);
            const protectedRole = member.role === "owner" || member.role === "admin";
            const roleName = member.custom_role_name || member.role;

            return (
              <article className="team-user-row" role="row" key={member.id}>
                <div className="team-user-primary" role="cell" data-label="Name">
                  <span className={`team-avatar team-avatar-${member.role}`} aria-hidden="true">{(profile?.full_name ?? "T").slice(0, 1).toUpperCase()}</span>
                  <span><strong>{profile?.full_name ?? "Team member"}</strong><small>{member.is_active ? "Active" : "Inactive"}</small></span>
                </div>
                <div role="cell" data-label="Email" className="team-user-email">{visibleEmail(profile?.email ?? null) ?? "No email"}</div>
                <div role="cell" data-label="Default role">
                  {!isManager && editable && !protectedRole ? (
                    <form action={assignBusinessRoleToEmployee} className="team-inline-role-form">
                      <input type="hidden" name="business_user_id" value={member.id} />
                      <input type="hidden" name="view_branch" value={selectedBranchId} />
                      <select name="role_id" defaultValue={member.role_id ?? ""} aria-label={`Default role for ${profile?.full_name ?? "team member"}`} required onChange={(event) => event.currentTarget.form?.requestSubmit()}>
                        <option value="" disabled>Choose role</option>
                        {businessRoles.map((businessRole) => <option value={businessRole.id} key={businessRole.id}>{businessRole.name}</option>)}
                      </select>
                    </form>
                  ) : <span className="status-chip">{roleName}</span>}
                </div>
                <div className="team-permission-cell" role="cell" data-label="Queue edit"><input type="checkbox" checked={member.can_view_queue_information_editing} readOnly aria-label={`${profile?.full_name ?? "User"} can edit queue`} /></div>
                <div className="team-permission-cell" role="cell" data-label="Call"><input type="checkbox" checked={member.can_call_customer} readOnly aria-label={`${profile?.full_name ?? "User"} can call customer`} /></div>
                <div className="team-permission-cell" role="cell" data-label="Complete"><input type="checkbox" checked={member.can_complete_ticket} readOnly aria-label={`${profile?.full_name ?? "User"} can complete ticket`} /></div>
                <div className="team-user-actions" role="cell" data-label="Actions">
                  {protectedRole || !editable ? <span className="team-protected-mark" title="Protected account">Protected</span> : (
                    <TeamMemberEditModal
                      userId={member.user_id}
                      memberName={profile?.full_name ?? "Team member"}
                      email={visibleEmail(profile?.email ?? null) ?? ""}
                      phone={profile?.phone ?? ""}
                      role={member.role as "manager" | "staff"}
                      businessRoleId={member.role_id ?? ""}
                      businessRoleName={member.custom_role_name ?? member.role}
                      branchScope={businessRoles.find((item) => item.id === member.role_id)?.branch_scope ?? (member.role === "staff" ? "own_branch_only" : "selected_branches")}
                      isActive={member.is_active}
                      assignedBranchIds={assignedIds}
                      branches={activeBranches.map((branch) => ({ id: branch.id, name: branch.name }))}
                      viewBranch={selectedBranchId}
                    />
                  )}
                </div>
              </article>
            );
          })}

          {!displayedMembers.length ? <div className="mini-empty"><strong>No users here yet.</strong><span>Add a user or choose another branch.</span></div> : null}
        </div>
      </section>

      <details className="dashboard-section team-add-user-panel">
        <summary><span><strong>Add User</strong><small>Create a new QueueDrop user and assign a default role and branch scope.</small></span><span aria-hidden="true">＋</span></summary>
        <div className="team-add-user-content">
          <form action={createTeamMember} className="form-stack management-form" autoComplete="off" data-no-global-loading="true" data-lpignore="true" data-1p-ignore="true">
            <input type="hidden" name="view_branch" value={selectedBranchId} />
            <TeamCreateFields branches={activeBranches} managerMode={isManager} businessRoles={businessRoles} selectedBranchId={selectedBranchId} />
            <button className="button button-primary" type="submit">Create user</button>
          </form>
        </div>
      </details>
    </>
  );
}
