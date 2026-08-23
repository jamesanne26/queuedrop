"use client";

import type { InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode">;

export function DigitsOnlyInput(props: Props) {
  return (
    <input
      {...props}
      type="tel"
      inputMode="numeric"
      pattern="[0-9]*"
      onInput={(event) => {
        event.currentTarget.value =
          event.currentTarget.value.replace(/\D/g, "");
        props.onInput?.(event);
      }}
    />
  );
}
