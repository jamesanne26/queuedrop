import test from "node:test";
import assert from "node:assert/strict";
import { resolveAuthenticatedLanding } from "../../lib/auth/landing.ts";

function fakeSupabase({ systemOwner = null, membership = null } = {}) {
  return {
    from(table) {
      const result = table === "system_owners" ? systemOwner : table === "business_users" ? membership : null;
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        limit() { return chain; },
        async maybeSingle() { return { data: result, error: null }; },
      };
      return chain;
    },
  };
}

const user = { id: "user-1", email: "owner@example.com" };

function withSystemOwnerEmails(value, fn) {
  const previous = process.env.SYSTEM_OWNER_EMAILS;
  if (value === undefined) delete process.env.SYSTEM_OWNER_EMAILS;
  else process.env.SYSTEM_OWNER_EMAILS = value;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previous === undefined) delete process.env.SYSTEM_OWNER_EMAILS;
      else process.env.SYSTEM_OWNER_EMAILS = previous;
    });
}

test("environment system owner always lands on system console", async () => {
  await withSystemOwnerEmails("other@example.com, OWNER@example.com ", async () => {
    const landing = await resolveAuthenticatedLanding(fakeSupabase(), user, "/dashboard/queues");
    assert.equal(landing, "/system");
  });
});

test("database system owner lands on system console", async () => {
  await withSystemOwnerEmails(undefined, async () => {
    const landing = await resolveAuthenticatedLanding(fakeSupabase({ systemOwner: { user_id: user.id } }), user, "/dashboard/queues");
    assert.equal(landing, "/system");
  });
});

test("safe internal next path is honored for normal users", async () => {
  await withSystemOwnerEmails(undefined, async () => {
    const landing = await resolveAuthenticatedLanding(fakeSupabase({ membership: { role: "owner" } }), user, "/dashboard/settings?view=roles");
    assert.equal(landing, "/dashboard/settings?view=roles");
  });
});

test("protocol-relative and external next values are rejected", async () => {
  await withSystemOwnerEmails(undefined, async () => {
    assert.equal(await resolveAuthenticatedLanding(fakeSupabase({ membership: { role: "owner" } }), user, "//evil.example"), "/dashboard");
    assert.equal(await resolveAuthenticatedLanding(fakeSupabase({ membership: { role: "owner" } }), user, "https://evil.example"), "/dashboard");
  });
});

test("staff defaults to live queue while other members default to dashboard", async () => {
  await withSystemOwnerEmails(undefined, async () => {
    assert.equal(await resolveAuthenticatedLanding(fakeSupabase({ membership: { role: "staff" } }), user), "/dashboard/queues");
    assert.equal(await resolveAuthenticatedLanding(fakeSupabase({ membership: { role: "manager" } }), user), "/dashboard");
  });
});
