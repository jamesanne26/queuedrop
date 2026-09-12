import test from "node:test";
import assert from "node:assert/strict";
import { rateLimitKey, requestClientIp } from "../../lib/security/rate-limit-core.ts";

test("rate-limit key is deterministic and does not expose the raw subject", () => {
  const key = rateLimitKey("kiosk_ticket", "device-token:203.0.113.10");
  assert.equal(key, rateLimitKey("kiosk_ticket", "device-token:203.0.113.10"));
  assert.equal(key.length, 64);
  assert.equal(key.includes("device-token"), false);
});

test("rate-limit keys are separated by policy", () => {
  assert.notEqual(rateLimitKey("a", "same"), rateLimitKey("b", "same"));
});

test("client IP prefers first forwarded address", () => {
  const headers = new Headers({ "x-forwarded-for": "203.0.113.10, 10.0.0.1", "x-real-ip": "198.51.100.2" });
  assert.equal(requestClientIp(headers), "203.0.113.10");
});

test("client IP falls back to real IP and then unknown", () => {
  assert.equal(requestClientIp(new Headers({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
  assert.equal(requestClientIp(new Headers()), "unknown");
});
