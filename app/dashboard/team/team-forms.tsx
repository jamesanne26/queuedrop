"use client";

import { useState } from "react";
import { DigitsOnlyInput } from "@/app/_components/digits-only-input";

type Branch = {
  id: string;
  name: string;
};

type Role = "manager" | "staff";
type BusinessRole = { id: string; name: string; base_role: "owner" | "admin" | "manager" | "staff"; branch_scope: "own_branch_only" | "selected_branches" | "all_branches"; is_system: boolean; is_protected: boolean };

function PasswordField({
  minLength,
  placeholder,
}: {
  minLength: number;
  placeholder: string;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <label>
      Temporary password
      <div className="password-input-wrap">
        <input
          name="temporary_password"
          type={showPassword ? "text" : "password"}
          required
          minLength={minLength}
          maxLength={72}
          pattern={undefined}
          title="Use 6-72 characters."
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
        Passwords require at least 6 characters.
      </small>
    </label>
  );
}

export function TeamCreateFields({
  branches,
  managerMode,
  businessRoles,
  selectedBranchId,
}: {
  branches: Branch[];
  managerMode: boolean;
  businessRoles: BusinessRole[];
  selectedBranchId: string;
}) {
  const availableRoles = businessRoles.filter((item) => managerMode ? item.base_role === "staff" : ["manager", "staff"].includes(item.base_role));
  const initialBusinessRole = availableRoles.find((item) => item.base_role === "staff") ?? availableRoles[0];
  const [businessRoleId, setBusinessRoleId] = useState(initialBusinessRole?.id ?? "");
  const selectedBusinessRole = availableRoles.find((item) => item.id === businessRoleId) ?? initialBusinessRole;
  const role = (selectedBusinessRole?.base_role === "manager" ? "manager" : "staff") as Role;

  const isStaff = role === "staff";
  const passwordMin = 6;

  return (
    <>
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="business_role_id" value={selectedBusinessRole?.id ?? ""} />
      <input type="hidden" name="custom_role_name" value={selectedBusinessRole?.name ?? "Staff"} />

      {selectedBusinessRole?.branch_scope === "own_branch_only" ? (
        <label>
          Branch
          <select key={`${businessRoleId}-${selectedBranchId}`} name="branch_ids" defaultValue={branches.length === 1 ? branches[0].id : selectedBranchId !== "all" ? selectedBranchId : ""} required>
            <option value="" disabled>
              Select one branch
            </option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <small>This declared role can belong to one branch only.</small>
        </label>
      ) : selectedBusinessRole?.branch_scope === "all_branches" ? (
        <div className="role-access-note"><strong>All branches</strong><span>This role automatically receives access to every branch in this business.</span></div>
      ) : (
        <fieldset className="branch-checkboxes">
          <legend>
            Branch <small>select at least one</small>
          </legend>
          {branches.map((branch) => (
            <label key={branch.id}>
              <input type="checkbox" name="branch_ids" value={branch.id} defaultChecked={branches.length === 1 || branch.id === selectedBranchId} />
              <span>{branch.name}</span>
            </label>
          ))}
        </fieldset>
      )}


      <label>
        Full name
        <input
          name="full_name"
          required
          minLength={2}
          maxLength={100}
          placeholder="Maria Santos"
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
        />
      </label>

      <label>
        Email{" "}
        <em>{isStaff ? "optional" : "required"}</em>
        <input
          name="email"
          type="email"
          required={!isStaff}
          maxLength={254}
          placeholder="maria@example.com"
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          spellCheck={false}
        />
      </label>

      <label>
        Mobile <em>required</em>
        <DigitsOnlyInput
          name="phone"
          required
          placeholder="09171234567"
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
        />
      </label>

      <label>
        Assigned Role
        <select value={businessRoleId} onChange={(event) => setBusinessRoleId(event.target.value)} required>
          {availableRoles.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        <small>Roles and their permissions are configured under Team & Roles → Roles.</small>
      </label>

      <small className="team-login-identifier-note">Role access follows the declared role selected above. Passwords use the same 6+ character rule for every team role.</small>

      <PasswordField
        minLength={passwordMin}
       
        placeholder="At least 6 characters"
      />
    </>
  );
}
