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
      <section className="dashboard-section team-branch-tabs-card">
        <label className="responsive-branch-select">
          <span>Branch</span>
          <select value={selectedBranchId} onChange={(event) => selectBranch(event.target.value)} aria-label="Select branch">
            <option value="all">View all team</option>
            {branches.map((branch) => (
              <option value={branch.id} key={branch.id}>
                {branch.name} - {memberCountByBranch.get(branch.id) ?? 0} people
              </option>
            ))}
          </select>
        </label>

        <div className="service-branch-tabs service-branch-tabs-desktop">
          <button
            type="button"
            onClick={() => selectBranch("all")}
            className={selectedBranchId === "all" ? "service-branch-tab service-branch-tab-active" : "service-branch-tab"}
          >
            <strong>View all team</strong>
            <span>{members.length} total</span>
          </button>
          {branches.map((branch) => (
            <button
              type="button"
              key={branch.id}
              onClick={() => selectBranch(branch.id)}
              className={selectedBranchId === branch.id ? "service-branch-tab service-branch-tab-active" : "service-branch-tab"}
            >
              <strong>{branch.name}</strong>
              <span>{memberCountByBranch.get(branch.id) ?? 0} people</span>
            </button>
          ))}
        </div>
      </section>

      <div className="team-layout">
        <section className="dashboard-section dashboard-section-stack management-list-card">
          <div className="section-row">
            <div>
              <p className="eyebrow">{isManager ? "Team in your branches" : "Business users"}</p>
              <h2>{displayedMembers.length} team member{displayedMembers.length === 1 ? "" : "s"}</h2>
            </div>
          </div>

          <div className="team-list">
            {displayedMembers.map((member) => {
              const profile = profileById.get(member.user_id);
              const assignedIds = branchesByUser.get(member.user_id) ?? [];
              const assignedNames = assignedIds.map((id) => branchById.get(id)?.name).filter(Boolean);
              const editable = canManageMember(member.role);
              const protectedRole = member.role === "owner" || member.role === "admin";

              return (
                <article className="team-card" key={member.id}>
                  <div className="team-card-header">
                    <div className="team-identity">
                      <div className={`team-avatar team-avatar-${member.role}`} aria-hidden="true">
                        {(profile?.full_name ?? "T").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="team-identity-copy">
                        <strong>{profile?.full_name ?? "Team member"}</strong>
                        <span>
                          {visibleEmail(profile?.email ?? null) ?? "No email"}
                          {profile?.phone ? ` - ${profile.phone}` : ""}
                        </span>
                      </div>
                    </div>
                    <div className="team-chip-row">
                      <span className="status-chip">{member.custom_role_name || member.role}</span>
                      <span className={member.is_active ? "status-chip" : "status-chip status-chip-off"}>
                        {member.is_active ? "active" : "inactive"}
                      </span>
                    </div>
                  </div>

                  {protectedRole || !editable ? (
                    <div className="team-owner-note">
                      {member.role === "owner"
                        ? "Business owner - protected"
                        : member.role === "admin"
                          ? "Business admin - protected"
                          : "You cannot manage this account"}
                    </div>
                  ) : (
                    <div className="team-card-summary">
                      <div>
                        <span className="field-label">Assigned branches</span>
                        <span className="team-assigned-summary">{assignedNames.length ? assignedNames.join(", ") : "No branch assigned"}</span>
                      </div>
                      {!isManager ? (
                        <form action={assignBusinessRoleToEmployee} className="team-role-assignment-form">
                          <input type="hidden" name="business_user_id" value={member.id} />
                          <input type="hidden" name="view_branch" value={selectedBranchId} />
                          <select name="role_id" defaultValue={member.role_id ?? ""} aria-label={`Role for ${profile?.full_name ?? "team member"}`} required>
                            <option value="" disabled>Assign role</option>
                            {businessRoles.map((businessRole) => (
                              <option value={businessRole.id} key={businessRole.id}>{businessRole.name}</option>
                            ))}
                          </select>
                          <button className="button button-secondary button-small" type="submit">Assign role</button>
                        </form>
                      ) : null}
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
                    </div>
                  )}
                </article>
              );
            })}
            {!displayedMembers.length ? (
              <div className="mini-empty">
                <strong>Set up your team.</strong>
                <span>No employee is assigned here yet. Create a team member on this page, or manage Team & Roles from Settings.</span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="dashboard-section dashboard-section-stack management-form-card">
          <div>
            <p className="eyebrow">Add team member</p>
            <h2>{isManager ? "Create team account" : "Create team account"}</h2>
            <p className="muted">
              {isManager
                ? "Create a team member using one of the declared roles available to you. Mobile is required; email follows the selected role access profile."
                : "Choose any declared business role below. Access and branch scope follow that role's configuration."}
            </p>
          </div>

          <form action={createTeamMember} className="form-stack management-form" autoComplete="off" data-no-global-loading="true" data-lpignore="true" data-1p-ignore="true">
            <input type="hidden" name="view_branch" value={selectedBranchId} />
            <TeamCreateFields branches={activeBranches} managerMode={isManager} businessRoles={businessRoles} selectedBranchId={selectedBranchId} />
            <button className="button button-primary" type="submit">Create team member</button>
          </form>
        </section>
      </div>
    </>
  );
}
