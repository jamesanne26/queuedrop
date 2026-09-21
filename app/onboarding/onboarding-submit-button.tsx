"use client";

import { useFormStatus } from "react-dom";

export function OnboardingSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="button button-primary button-large" type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? "Saving business & branch…" : "Save business & first branch"}
    </button>
  );
}
