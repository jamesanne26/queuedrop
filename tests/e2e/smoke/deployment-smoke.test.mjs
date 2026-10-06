import test from "node:test";
import assert from "node:assert/strict";

const rawBase = process.env.QUEUEDROP_TEST_BASE_URL || "";
const base = rawBase.replace(/\/$/, "");
const enabled = Boolean(base);
const required = process.env.QUEUEDROP_REQUIRE_SMOKE === "1";
const timeoutMs = 15_000;

function validateBaseUrl() {
  if (!base) return;
  const parsed = new URL(base);
  assert.ok(["http:", "https:"].includes(parsed.protocol), "QUEUEDROP_TEST_BASE_URL must use HTTP or HTTPS");
}

if (required) {
  test("smoke environment is configured", () => {
    assert.ok(base, "QUEUEDROP_TEST_BASE_URL is required for smoke tests");
    validateBaseUrl();
  });
}

async function fetchWithTimeout(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${base}${path}`, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      assert.fail(`${path} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function expectPublicPage(path) {
  const response = await fetchWithTimeout(path, { redirect: "manual" });
  assert.equal(response.status, 200, `${path} returned ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  assert.match(contentType, /text\/html/i, `${path} did not return HTML`);
}

test("health endpoint is healthy", { skip: !enabled }, async () => {
  validateBaseUrl();
  const response = await fetchWithTimeout("/api/health");
  assert.equal(response.status, 200, `health returned ${response.status}`);
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.equal(body.database, "ok");
  assert.equal(body.service, "queuedrop-web");
});

test("public homepage, login, and pricing pages load", { skip: !enabled }, async () => {
  await expectPublicPage("/");
  await expectPublicPage("/auth/login");
  await expectPublicPage("/pricing");
});

test("dashboard redirects unauthenticated users to login", { skip: !enabled }, async () => {
  const response = await fetchWithTimeout("/dashboard", { redirect: "manual" });
  assert.ok([302, 303, 307, 308].includes(response.status), `/dashboard returned ${response.status} instead of redirecting`);
  const location = response.headers.get("location") || "";
  assert.match(location, /\/auth\/login(?:\?|$)/, `unexpected dashboard redirect: ${location}`);
});
