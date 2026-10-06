import test from "node:test";
import assert from "node:assert/strict";
import { fetchAllPages, validRequestId, ticketCanPrint } from "../../lib/queue/reliability.ts";
import { probeReadiness } from "../../lib/operations/health.ts";
import { smsTicketEligible, ambiguousDeliveryError } from "../../lib/notifications/delivery-safety.ts";

test("stub request ids reject malformed and missing values", () => {
  for (const id of [null, undefined, "", "123", "x".repeat(36)]) assert.equal(validRequestId(id), false);
  assert.equal(validRequestId("00000000-0000-4000-8000-000000000001"), true);
});
for (const status of ["waiting", "called", "serving", "cancelled", "completed", "no_show", "not_completed"]) {
  test(`print eligibility: ${status}`, () => assert.equal(ticketCanPrint(status), ["waiting", "called", "serving"].includes(status)));
}
test("pagination retrieves every ticket beyond 250 and 1000", async () => {
  const expected = Array.from({ length: 1251 }, (_, id) => ({ id }));
  const actual = await fetchAllPages(async (from, to) => ({ data: expected.slice(from, to + 1), error: null }));
  assert.deepEqual(actual, expected);
});
test("pagination handles exact page multiples and empty queues", async () => {
  let calls = 0;
  const actual = await fetchAllPages(async (from) => {
    calls++;
    return { data: from < 500 ? Array(500).fill(1) : [], error: null };
  });
  assert.equal(actual.length, 500); assert.equal(calls, 2);
  assert.deepEqual(await fetchAllPages(async () => ({ data: [], error: null })), []);
});
test("pagination fails explicitly instead of returning a partial queue", async () => {
  await assert.rejects(fetchAllPages(async () => ({ data: null, error: { message: "database unavailable" } })), /database unavailable/);
  await assert.rejects(fetchAllPages(async () => ({ data: [], error: null }), 0), /Invalid page size/);
});
test("readiness detects healthy, failed and timed-out databases", async () => {
  assert.equal((await probeReadiness(async () => ({ error: null }))).status, "ok");
  assert.equal((await probeReadiness(async () => ({ error: "outage" }))).status, "degraded");
  assert.equal((await probeReadiness(async () => { throw new Error("timeout"); })).status, "degraded");
});

test("obsolete SMS alerts are not eligible for sending", () => {
  for (const status of [null, "cancelled", "completed", "serving", "not_completed"]) assert.equal(smsTicketEligible(status), false);
  assert.equal(smsTicketEligible("waiting"), true); assert.equal(smsTicketEligible("called"), true);
});
test("uncertain network results require review instead of provider failover", () => {
  for (const name of ["TimeoutError", "AbortError", "TypeError"]) {
    const error = new Error("uncertain"); error.name = name;
    assert.equal(ambiguousDeliveryError(error), true);
  }
  assert.equal(ambiguousDeliveryError(new Error("provider rejected")), false);
});
