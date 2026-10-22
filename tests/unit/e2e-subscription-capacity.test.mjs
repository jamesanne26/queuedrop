import test from "node:test";
import assert from "node:assert/strict";
import { assertDedicatedTestProject, ensureE2ESubscriptionAccess } from "../e2e/helpers/subscription-fixture.mjs";

test("E2E capacity override is restricted to dedicated TEST Supabase", () => {
  assert.doesNotThrow(() => assertDedicatedTestProject("https://tcgiwtfhqssulxwawimh.supabase.co"));
  assert.throws(() => assertDedicatedTestProject("https://sylvegfbkxgjfctbjfec.supabase.co"), /dedicated TEST/);
});

test("E2E setup raises service, active queue and branch limits with 24-hour expiry", async () => {
  const now = Date.parse("2026-10-22T00:00:00.000Z");
  const changes = [];
  const subscription = { id: "sub_test", status: "active", expires_at: "2026-11-01T00:00:00Z" };
  const query = (table) => {
    let operation = "select", payload;
    const q = {
      select() { return q; }, eq() { return q; },
      update(value) { operation = "update"; payload = value; return q; },
      async maybeSingle() {
        if (operation === "update") { changes.push({ table, payload }); return { data: { id: "sub_test" }, error: null }; }
        if (table === "business_subscriptions" && changes.length === 0) {
          if (!q.reads) { q.reads = 1; return { data: subscription, error: null }; }
        }
        return { data: { custom_max_branches: 1, custom_max_active_queues_per_branch: 1, custom_max_services_per_branch: 1, override_expires_at: null }, error: null };
      },
    };
    return q;
  };
  let subscriptionReads = 0;
  const admin = {
    from(table) {
      const q = query(table);
      const original = q.maybeSingle;
      q.maybeSingle = async () => {
        if (subscriptionReads++ === 0) return { data: subscription, error: null };
        return original();
      };
      return q;
    },
    async rpc() { return { data: "active", error: null }; },
  };
  await ensureE2ESubscriptionAccess(admin, { role: "owner", businessId: "biz_test" }, "https://tcgiwtfhqssulxwawimh.supabase.co", now);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].payload.custom_max_branches, 20);
  assert.equal(changes[0].payload.custom_max_active_queues_per_branch, 20);
  assert.equal(changes[0].payload.custom_max_services_per_branch, 20);
  assert.equal(changes[0].payload.override_expires_at, "2026-10-23T00:00:00.000Z");
});
