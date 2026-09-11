import test from "node:test";
import assert from "node:assert/strict";
import { addBillingMonth, addBillingYear, addBillingPeriod, getSubscriptionAccessState, subscriptionAllowsWrites } from "../../lib/billing/subscription.ts";

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
test("billing year handles leap day safely", () => {
  assert.equal(addBillingYear(new Date("2028-02-29T10:00:00Z")).toISOString(), "2029-02-28T10:00:00.000Z");
});
test("billing period uses the selected monthly or annual cadence", () => {
  const start = new Date("2026-09-11T06:47:10Z");
  assert.equal(addBillingPeriod(start, "monthly").toISOString(), "2026-10-11T06:47:10.000Z");
  assert.equal(addBillingPeriod(start, "yearly").toISOString(), "2027-09-11T06:47:10.000Z");
});
