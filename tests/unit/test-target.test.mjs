import { test } from "node:test";
import assert from "node:assert/strict";
import { isDedicatedTestTarget } from "../e2e/helpers/test-target.mjs";

const testDb = "https://tcgiwtfhqssulxwawimh.supabase.co";
const testVercel = "https://queuedrop-test.vercel.app";
const localRunner = "http://127.0.0.1:3000";

test("accepts only dedicated TEST deployment or opted-in local runner", () => {
  assert.equal(isDedicatedTestTarget(testVercel, { QUEUEDROP_TEST_SUPABASE_URL: testDb }), true);
  assert.equal(isDedicatedTestTarget(localRunner, { QUEUEDROP_TEST_SUPABASE_URL: testDb }), false);
  assert.equal(isDedicatedTestTarget(localRunner, { QUEUEDROP_TEST_SUPABASE_URL: testDb, QUEUEDROP_E2E_RUNNER_LOCAL: "true" }), true);
});

test("rejects Production, lookalike, and insecure Supabase targets", () => {
  for (const url of [
    "https://sylvegfbkxgjfctbjfec.supabase.co",
    "https://tcgiwtfhqssulxwawimh.supabase.co.evil.example",
    "http://tcgiwtfhqssulxwawimh.supabase.co",
    "https://user:pass@tcgiwtfhqssulxwawimh.supabase.co",
    "https://tcgiwtfhqssulxwawimh.supabase.co:8443",
    "https://tcgiwtfhqssulxwawimh.supabase.co/rest/v1",
    "https://tcgiwtfhqssulxwawimh.supabase.co?x=1",
    "https://tcgiwtfhqssulxwawimh.supabase.co/#fragment",
    "not-a-url",
  ]) assert.equal(isDedicatedTestTarget(testVercel, { QUEUEDROP_TEST_SUPABASE_URL: url }), false, url);
});

test("rejects non-TEST app origins and URL decorations", () => {
  for (const url of [
    "https://getqueuedrop.com",
    "https://queuedrop-test.vercel.app.evil.example",
    "http://queuedrop-test.vercel.app",
    "https://user:pass@queuedrop-test.vercel.app",
    "https://queuedrop-test.vercel.app/api/health",
    "https://queuedrop-test.vercel.app?x=1",
    "https://queuedrop-test.vercel.app/#fragment",
    "http://localhost:3000",
    "http://127.0.0.1:3001",
    "not-a-url",
  ]) assert.equal(isDedicatedTestTarget(url, { QUEUEDROP_TEST_SUPABASE_URL: testDb, QUEUEDROP_E2E_RUNNER_LOCAL: "true" }), false, url);
});

test("missing TEST Supabase configuration fails closed", () => {
  assert.equal(isDedicatedTestTarget(testVercel, {}), false);
});
