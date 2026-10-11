import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const rawBase = process.env.QUEUEDROP_TEST_BASE_URL || "";
const base = rawBase.replace(/\/$/, "");
const enabled = Boolean(base);
const required = process.env.QUEUEDROP_REQUIRE_SMOKE === "1";
const timeoutMs = 30_000;

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

const approvedInstallers = [
  { label: "Production migration", stem: "/installers/QueueDrop-PrintBridge-PROD-v2.0.0", applicationId: "com.getqueuedrop.printbridge.prod", testOnly: false },
  { label: "TEST recovery", stem: "/installers/QueueDrop-Recovery-TEST-v2.0.0", applicationId: "com.getqueuedrop.printbridge.next", testOnly: true },
];
for (const installer of approvedInstallers) {
  test(`approved ${installer.label} APK is downloadable and matches its manifest`, { skip: !enabled }, async () => {
    const metadata = await fetchWithTimeout(`${installer.stem}.json`);
    assert.equal(metadata.status, 200, "Installer manifest is missing");
    const manifest = await metadata.json();
    assert.equal(manifest.applicationId, installer.applicationId);
    assert.equal(manifest.testOnly, installer.testOnly);
    const response = await fetchWithTimeout(`${installer.stem}.apk`);
    assert.equal(response.status, 200, "Installer file is missing");
    assert.doesNotMatch(response.headers.get("content-type") || "", /text\/html/i);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, manifest.bytes, "Installer is truncated or metadata is stale");
    assert.equal(bytes.subarray(0, 4).toString("hex"), "504b0304", "Installer must be an APK/ZIP");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), manifest.sha256, "Installer checksum mismatch");
  });
}

for (const path of ["/api/reports/export", "/api/internal/operations", "/api/internal/queues/end-of-day", "/api/internal/subscriptions/reconcile", "/api/internal/sms/dispatch"]) {
  test(`${path} rejects requests without authentication`, { skip: !enabled }, async () => {
    const response = await fetchWithTimeout(path, { redirect: "manual" });
    assert.equal(response.status, 401, `${path} must not expose protected data or run workers`);
  });
}

for (const path of ["/api/support/attachments?action=list", "/api/support/notifications"]) {
  test(`${path} rejects missing and malformed support sessions`, { skip: !enabled }, async () => {
    for (const authorization of ["", "Bearer invalid"]) {
      const response = await fetchWithTimeout(path, { method: "POST", headers: { authorization, "Content-Type": "application/json" }, body: "{}" });
      assert.equal(response.status, 403, "Support data must require a valid private session");
    }
  });
}

test("deployed HTML retains the browser security headers", { skip: !enabled }, async () => {
  const response = await fetchWithTimeout("/auth/login");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.match(response.headers.get("content-security-policy") || "", /frame-ancestors 'self'/);
  assert.match(response.headers.get("content-security-policy") || "", /object-src 'none'/);
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  if (base.startsWith("https:")) assert.match(response.headers.get("strict-transport-security") || "", /max-age=\d+/);
});

test("unsigned payment webhooks cannot activate a subscription", { skip: !enabled }, async () => {
  const response = await fetchWithTimeout("/api/payments/paymongo/webhook", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"data":{}}' });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "Invalid signature");
});

test("malformed printer completion claims are rejected before database access", { skip: !enabled }, async () => {
  const response = await fetchWithTimeout("/api/print-bridge/00000000-0000-4000-8000-000000000000/jobs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: "invalid", generation: -1, attempt: 0, uncertain: true }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "Invalid printer claim.");
});

