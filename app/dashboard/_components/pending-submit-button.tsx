"use client";

import { useFormStatus } from "react-dom";

type Props = {
  idle: string;
  pending: string;
  className?: string;
  disabled?: boolean;
};

export function PendingSubmitButton({ idle, pending, className = "button button-primary", disabled = false }: Props) {
  const { pending: isPending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={isPending || disabled} aria-disabled={isPending || disabled}>
      {isPending ? pending : idle}
    </button>
  );
}
