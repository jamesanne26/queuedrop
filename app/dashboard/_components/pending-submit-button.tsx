"use client";

import { useFormStatus } from "react-dom";

type Props = {
  idle: string;
  pending: string;
  className?: string;
};

export function PendingSubmitButton({ idle, pending, className = "button button-primary" }: Props) {
  const { pending: isPending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={isPending} aria-disabled={isPending}>
      {isPending ? pending : idle}
    </button>
  );
}
