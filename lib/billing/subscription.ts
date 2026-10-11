export type SubscriptionStateInput = { status?: string | null; expiresAt?: string | null; now?: Date };
export type SubscriptionAccessState = "active" | "trialing" | "past_due" | "cancelled" | "expired" | "none";
export type BillingInterval = "monthly" | "yearly";
export type RenewalMode = "manual" | "auto";

export function getSubscriptionAccessState(input: SubscriptionStateInput): SubscriptionAccessState {
  const status = String(input.status ?? "").toLowerCase();
  if (!status) return "none";
  const expires = input.expiresAt ? new Date(input.expiresAt) : null;
  const now = input.now ?? new Date();
  if (expires && !Number.isNaN(expires.getTime()) && expires <= now && ["active", "trialing", "past_due"].includes(status)) return "expired";
  if (["active", "trialing", "past_due", "cancelled", "expired"].includes(status)) return status as SubscriptionAccessState;
  return "none";
}

export function subscriptionAllowsWrites(state: SubscriptionAccessState) { return state === "active" || state === "trialing"; }

export function addBillingMonth(from: Date) {
  const result = new Date(from);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function addBillingYear(from: Date) {
  const result = new Date(from);
  const month = result.getUTCMonth();
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCFullYear(result.getUTCFullYear() + 1);
  result.setUTCMonth(month);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), month + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function addBillingPeriod(from: Date, interval: BillingInterval) {
  return interval === "yearly" ? addBillingYear(from) : addBillingMonth(from);
}

export function parseBillingInterval(value: FormDataEntryValue | string | null | undefined): BillingInterval {
  return String(value ?? "monthly").toLowerCase() === "yearly" ? "yearly" : "monthly";
}

export function parseRenewalMode(value: FormDataEntryValue | string | null | undefined): RenewalMode {
  return String(value ?? "manual").toLowerCase() === "auto" ? "auto" : "manual";
}


export type ExistingSubscriptionAccess = {
  status?: string | null;
  started_at?: string | null;
  expires_at?: string | null;
} | null | undefined;

export function resolveClientTrialAccess(
  customTrialDays: number | null,
  existing: ExistingSubscriptionAccess,
  now: Date,
) {
  if (customTrialDays !== null) {
    if (!Number.isInteger(customTrialDays) || customTrialDays < 0) {
      throw new Error("Trial days must be a non-negative whole number.");
    }
    const startedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + customTrialDays * 86_400_000).toISOString();
    return {
      status: customTrialDays > 0 ? "trialing" : "expired",
      startedAt,
      expiresAt,
    } as const;
  }

  return {
    status: existing?.status ?? "active",
    startedAt: existing?.started_at ?? now.toISOString(),
    expiresAt: existing?.expires_at ?? null,
  } as const;
}
