import test from "node:test";
import assert from "node:assert/strict";
import { assertTestSupabaseTarget } from "../../scripts/assert-test-supabase-target.mjs";

const TEST_URL = "https://tcgiwtfhqssulxwawimh.supabase.co";
test("accepts only the exact dedicated QueueDrop TEST Supabase URL", () => {
  assert.doesNotThrow(() => assertTestSupabaseTarget(TEST_URL));
  assert.doesNotThrow(() => assertTestSupabaseTarget(`${TEST_URL}/`));
});

test("rejects Production, malformed and lookalike Supabase URLs", () => {
  for (const value of [
    undefined, "", "not-a-url",
    "https://sylvegfbkxgjfctbjfec.supabase.co",
    "http://tcgiwtfhqssulxwawimh.supabase.co",
    `${TEST_URL}.attacker.example`,
    `${TEST_URL}/rest/v1`,
    `${TEST_URL}?environment=prod`,
    "https://user:password@tcgiwtfhqssulxwawimh.supabase.co",
    "https://tcgiwtfhqssulxwawimh.supabase.co:8443",
  ]) {
    assert.throws(() => assertTestSupabaseTarget(value), /TEST Supabase project|valid HTTPS URL/);
  }
});
