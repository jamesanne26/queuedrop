"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function AuthSubmitButton({
  children,
  pendingLabel,
}: {
  children: ReactNode;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className="button button-primary" type="submit" disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
