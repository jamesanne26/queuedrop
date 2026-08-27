"use client";

import { useState } from "react";
import { DigitsOnlyInput } from "@/app/_components/digits-only-input";

type Branch = {
  id: string;
  name: string;
};

type Role = "manager" | "staff";

function PasswordField({
  minLength,
  placeholder,
  managerPassword,
}: {
  minLength: number;
  placeholder: string;
  managerPassword: boolean;
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
          pattern={managerPassword ? "(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{10,72}" : undefined}
          title={managerPassword ? "Use 10-72 characters with uppercase, lowercase, number, and symbol." : "Use at least 6 characters."}
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
        {managerPassword
          ? "Manager passwords: 10+ characters, with uppercase, lowercase, number, and symbol."
          : "Staff passwords require at least 6 characters."}
      </small>
    </label>
  );
}

export function TeamCreateFields({
  branches,
  managerMode,
}: {
  branches: Branch[];
  managerMode: boolean;
}) {
  const [role, setRole] = useState<Role>("staff");

  const isStaff = role === "staff";
  const passwordMin = isStaff ? 6 : 10;

  return (
    <>
      <input
        type="hidden"
        name="role"
        value={managerMode ? "staff" : role}
      />

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
        Role
        {managerMode ? (
          <input value="Staff" disabled />
        ) : (
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
          >
            <option value="manager">Manager</option>
            <option value="staff">Staff</option>
          </select>
        )}
      </label>

      {isStaff ? (
        <label>
          Branch
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
      ) : (
        <fieldset className="branch-checkboxes">
          <legend>
            Branch <small>select at least one</small>
          </legend>
          {branches.map((branch) => (
            <label key={branch.id}>
              <input type="checkbox" name="branch_ids" value={branch.id} />
              <span>{branch.name}</span>
            </label>
          ))}
        </fieldset>
      )}

      {isStaff ? (
        <small className="team-login-identifier-note">Mobile number is required for staff. Email is optional.</small>
      ) : (
        <small className="team-login-identifier-note">All manager fields are required.</small>
      )}

      <PasswordField
        minLength={passwordMin}
        managerPassword={!isStaff}
        placeholder={isStaff ? "At least 6 characters" : "10+ characters"}
      />
    </>
  );
}
