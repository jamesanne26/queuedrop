import test from "node:test";
import assert from "node:assert/strict";

const base = (process.env.QUEUEDROP_TEST_BASE_URL || "").replace(/\/$/, "");
const enabled = Boolean(base);
const required = process.env.QUEUEDROP_REQUIRE_SMOKE === "1";

if (required) {
  test("smoke environment is configured", () => {
    assert.ok(base, "QUEUEDROP_TEST_BASE_URL is required for smoke tests");
  });
}

async function expectHealthy(path) {
  const response = await fetch(`${base}${path}`, { redirect: "manual" });
  assert.ok(response.status < 500, `${path} returned ${response.status}`);
  return response;
}

test("health endpoint is healthy", { skip: !enabled }, async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.ok, true, `health returned ${response.status}`);
});

test("public login and pricing pages do not return server errors", { skip: !enabled }, async () => {
  await expectHealthy("/auth/login");
  await expectHealthy("/pricing");
});

test("dashboard protects unauthenticated access without server failure", { skip: !enabled }, async () => {
  const response = await expectHealthy("/dashboard");
  assert.ok([200, 302, 303, 307, 308].includes(response.status));
});
