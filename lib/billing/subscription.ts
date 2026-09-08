export type SubscriptionStateInput = { status?: string | null; expiresAt?: string | null; now?: Date };
export type SubscriptionAccessState = "active" | "trialing" | "past_due" | "cancelled" | "expired" | "none";

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
  const result = new Date(from); const day = result.getUTCDate();
  result.setUTCDate(1); result.setUTCMonth(result.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay)); return result;
}
