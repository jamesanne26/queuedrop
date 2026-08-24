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
  );
}
