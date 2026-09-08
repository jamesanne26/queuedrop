import test from "node:test";
import assert from "node:assert/strict";
import { addBillingMonth, getSubscriptionAccessState, subscriptionAllowsWrites } from "../../lib/billing/subscription.ts";

test("active and trialing subscriptions allow writes", () => {
  assert.equal(subscriptionAllowsWrites("active"), true);
  assert.equal(subscriptionAllowsWrites("trialing"), true);
  assert.equal(subscriptionAllowsWrites("past_due"), false);
});
test("expired timestamp wins over stale active/trialing status", () => {
  const now = new Date("2026-09-08T00:00:00Z");
  assert.equal(getSubscriptionAccessState({ status: "trialing", expiresAt: "2026-09-07T23:59:59Z", now }), "expired");
  assert.equal(getSubscriptionAccessState({ status: "active", expiresAt: "2026-10-08T00:00:00Z", now }), "active");
});
test("billing month handles end-of-month safely", () => {
  assert.equal(addBillingMonth(new Date("2026-01-31T10:00:00Z")).toISOString(), "2026-02-28T10:00:00.000Z");
});
