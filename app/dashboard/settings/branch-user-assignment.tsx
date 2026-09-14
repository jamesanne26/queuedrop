"use client";

import { useMemo, useState } from "react";
import { updateBranchUserAssignment } from "@/app/dashboard/team/actions";
import { canAssignRoleToAnotherBranch, effectiveRoleBranchScope } from "@/lib/auth/role-scope";

type Member = { id: string; user_id: string; role: string; role_id?: string | null; custom_role_name?: string | null; is_active: boolean };
type Profile = { id: string; full_name: string | null; email: string | null };
type BusinessRole = { id: string; name: string; branch_scope: "own_branch_only" | "selected_branches" | "all_branches" };

type Props = {
  branchId: string;
  branchName: string;
  members: Member[];
  profiles: Profile[];
  assignedUserIds: string[];
  canManage: boolean;
  businessRoles: BusinessRole[];
  allAssignments: { user_id: string; branch_id: string }[];
};

export function BranchUserAssignment({ branchId, branchName, members, profiles, assignedUserIds, canManage, businessRoles, allAssignments }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const assigned = useMemo(() => new Set(assignedUserIds), [assignedUserIds]);
  const manageable = useMemo(() => members.filter((member) => !["owner", "admin"].includes(member.role)), [members]);
  const roleById = useMemo(() => new Map(businessRoles.map((role) => [role.id, role])), [businessRoles]);
  const assignmentCountByUser = useMemo(() => {
    const counts = new Map<string, number>();
    for (const assignment of allAssignments) counts.set(assignment.user_id, (counts.get(assignment.user_id) ?? 0) + 1);
    return counts;
  }, [allAssignments]);
  const assignedMembers = manageable.filter((member) => assigned.has(member.user_id));
  const availableMembers = manageable.filter((member) => {
    if (assigned.has(member.user_id)) return false;
    const declaredRole = member.role_id ? roleById.get(member.role_id) : undefined;
    const scope = effectiveRoleBranchScope(declaredRole?.branch_scope, member.role);
    return canAssignRoleToAnotherBranch(scope, assignmentCountByUser.get(member.user_id) ?? 0);
  });
  function roleLabel(member: Member) {
    const declaredRole = member.role_id ? roleById.get(member.role_id) : undefined;
    return declaredRole?.name ?? member.custom_role_name ?? member.role;
  }

  function preserveBranchUsersView() {
    const url = new URL(window.location.href);
    url.searchParams.set("branch", branchId);
    url.searchParams.set("view", "branch-users");
    window.history.replaceState(window.history.state, "", `${url.pathname}?${url.searchParams.toString()}`);
  }

  return (
    <section className="settings-branch-user-assignment">
      <div className="settings-catalog-header settings-branch-users-header">
        <div>
          <p className="eyebrow">Branch · Users</p>
          <h2>{branchName} users</h2>
          <p className="muted">Users assigned to this branch. Add or remove access here.</p>
        </div>
        {canManage ? <button className="button button-primary" type="button" onClick={() => setAddOpen(true)}>+ Add user</button> : null}
      </div>

      <div className="settings-user-assignment-list settings-user-assignment-list-readonly">
        {assignedMembers.map((member) => {
          const profile = profileById.get(member.user_id);
          return (
            <article key={member.user_id} className="settings-user-assignment-row settings-user-assignment-row-readonly">
              <span className="settings-user-assignment-copy">
                <strong>{profile?.full_name ?? "Team member"}</strong>
                <small>{profile?.email ?? "No email"} · {roleLabel(member)} · {member.is_active ? "Active" : "Inactive"}</small>
              </span>
              {canManage ? (
                <form action={updateBranchUserAssignment} onSubmit={(event) => {
                  if (!window.confirm(`Remove ${profile?.full_name ?? "this user"} from ${branchName}?`)) event.preventDefault();
                  else preserveBranchUsersView();
                }}>
                  <input type="hidden" name="branch_id" value={branchId} />
                  <input type="hidden" name="user_id" value={member.user_id} />
                  <input type="hidden" name="mode" value="remove" />
                  <button className="button button-danger-outline button-small" type="submit">Remove user</button>
                </form>
              ) : null}
            </article>
          );
        })}
        {!assignedMembers.length ? <div className="mini-empty"><strong>No users assigned.</strong><span>Use Add user to assign someone from Users &amp; Access.</span></div> : null}
      </div>

      {addOpen ? (
        <div className="qd-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAddOpen(false); }}>
          <section className="qd-modal qd-branch-user-modal" role="dialog" aria-modal="true" aria-labelledby="branch-add-user-title">
            <div className="qd-modal-header">
              <div><p className="eyebrow">Branch access</p><h2 id="branch-add-user-title">Add user to {branchName}</h2></div>
              <button className="qd-modal-close" type="button" onClick={() => setAddOpen(false)} aria-label="Close">×</button>
            </div>
            {availableMembers.length ? (
              <form action={updateBranchUserAssignment} className="form-stack" onSubmit={() => { preserveBranchUsersView(); setAddOpen(false); }}>
                <input type="hidden" name="branch_id" value={branchId} />
                <input type="hidden" name="mode" value="add" />
                <label>Select user
                  <select name="user_id" required value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
                    <option value="" disabled>Choose a user</option>
                    {availableMembers.map((member) => {
                      const profile = profileById.get(member.user_id);
                      return <option key={member.user_id} value={member.user_id}>{profile?.full_name ?? "Team member"}{profile?.email ? ` · ${profile.email}` : ""} · {roleLabel(member)}</option>;
                    })}
                  </select>
                </label>
                <div className="qd-modal-actions">
                  <button className="button button-secondary" type="button" onClick={() => setAddOpen(false)}>Cancel</button>
                  <button className="button button-primary" type="submit" disabled={!selectedUserId}>Add user</button>
                </div>
              </form>
            ) : <div className="mini-empty"><strong>No users available.</strong><span>Everyone eligible is already assigned to this branch.</span></div>}
          </section>
        </div>
      ) : null}
    </section>
  );
}
