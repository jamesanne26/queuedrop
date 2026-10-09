import test from "node:test";
import assert from "node:assert/strict";
import { addBillingMonth, addBillingYear, addBillingPeriod, getSubscriptionAccessState, subscriptionAllowsWrites, resolveClientTrialAccess } from "../../lib/billing/subscription.ts";

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


test("client override starts a fresh trial for the configured number of days", () => {
  const now = new Date("2026-10-10T00:30:00.000Z");
  const access = resolveClientTrialAccess(14, {
    status: "trialing",
    started_at: "2026-09-23T10:46:48.000Z",
    expires_at: "2026-10-09T16:03:36.910Z",
  }, now);
  assert.deepEqual(access, {
    status: "trialing",
    startedAt: "2026-10-10T00:30:00.000Z",
    expiresAt: "2026-10-24T00:30:00.000Z",
  });
  assert.equal(getSubscriptionAccessState({ status: access.status, expiresAt: access.expiresAt, now }), "trialing");
});

test("saving other client overrides does not restore an expired subscription", () => {
  const now = new Date("2026-10-10T00:30:00.000Z");
  const access = resolveClientTrialAccess(null, {
    status: "trialing",
    started_at: "2026-09-23T10:46:48.000Z",
    expires_at: "2026-10-09T16:03:36.910Z",
  }, now);
  assert.equal(access.status, "trialing");
  assert.equal(access.expiresAt, "2026-10-09T16:03:36.910Z");
  assert.equal(getSubscriptionAccessState({ status: access.status, expiresAt: access.expiresAt, now }), "expired");
});

test("zero-day client trial override leaves access expired", () => {
  const now = new Date("2026-10-10T00:30:00.000Z");
  const access = resolveClientTrialAccess(0, null, now);
  assert.equal(access.status, "expired");
  assert.equal(getSubscriptionAccessState({ status: access.status, expiresAt: access.expiresAt, now }), "expired");
});

test("client trial override rejects invalid day counts", () => {
  const now = new Date("2026-10-10T00:30:00.000Z");
  for (const days of [-1, 1.5, Number.NaN]) {
    assert.throws(() => resolveClientTrialAccess(days, null, now), /whole number/);
  }
});
