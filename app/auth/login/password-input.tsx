"use client";

import { useState } from "react";

type PasswordInputProps = {
  name?: string;
  autoComplete?: string;
  required?: boolean;
  placeholder?: string;
};

export function PasswordInput({
  name = "password",
  autoComplete = "current-password",
  required = true,
  placeholder = "********",
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="password-input-wrap">
      <input
        name={name}
        type={showPassword ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setShowPassword((current) => !current)}
        aria-label={showPassword ? "Hide password" : "Show password"}
        title={showPassword ? "Hide password" : "Show password"}
      >
        {showPassword ? "Hide" : "Show"}
      </button>
    </div>
  );
}
