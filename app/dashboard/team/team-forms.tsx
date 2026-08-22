"use client";

import { useState } from "react";

type Branch = {
  id: string;
  name: string;
};

type Role = "manager" | "staff";

export function BranchAssignmentFields({
  branches,
  initialRole,
  initialBranchIds = [],
}: {
  branches: Branch[];
  initialRole: Role;
  initialBranchIds?: string[];
}) {
  const [role, setRole] = useState<Role>(initialRole);
  const initialStaffBranch = initialBranchIds[0] ?? "";

  return (
    <>
      <label>
        Role
        <select
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value as Role)}
        >
          <option value="manager">Manager</option>
          <option value="staff">Staff</option>
        </select>
      </label>

      {role === "staff" ? (
        <label>
          Assigned branch
          <select
            name="branch_ids"
            defaultValue={initialStaffBranch}
            required
          >
            <option value="" disabled>
              Select one branch
            </option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <small>Staff can belong to one branch only.</small>
        </label>
      ) : (
        <fieldset className="branch-checkboxes">
          <legend>
            Assigned branches <small>select at least one</small>
          </legend>
          {branches.map((branch) => (
            <label key={branch.id}>
              <input
                type="checkbox"
                name="branch_ids"
                value={branch.id}
                defaultChecked={initialBranchIds.includes(branch.id)}
              />
              <span>{branch.name}</span>
            </label>
          ))}
        </fieldset>
      )}
    </>
  );
}

export function ManagerStaffCreateFields({
  branches,
  managerMode,
}: {
  branches: Branch[];
  managerMode: boolean;
}) {
  if (managerMode) {
    return (
      <>
        <input type="hidden" name="role" value="staff" />
        <label>
          Role
          <input value="Staff" disabled />
        </label>
        <label>
          Assigned branch
          <select name="branch_ids" defaultValue="" required>
            <option value="" disabled>
              Select one branch
            </option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <small>Staff can belong to one branch only.</small>
        </label>
      </>
    );
  }

  return (
    <BranchAssignmentFields
      branches={branches}
      initialRole="staff"
      initialBranchIds={[]}
    />
  );
}
