import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCloudflareTestConfiguration,
  assertCloudflareTestHealth,
  verifyCloudflareTestRevision,
} from "../../scripts/verify-cloudflare-test-revision.mjs";

const valid = {
  baseUrl: "https://queuedrop-test.jamesrae-rosario18.workers.dev",
  supabaseUrl: "https://tcgiwtfhqssulxwawimh.supabase.co",
  sha: "a".repeat(40),
};

test("requires exact TEST app and Supabase origins", () => {
  assert.deepEqual(assertCloudflareTestConfiguration(valid), {
    origin: valid.baseUrl,
    expectedRevision: "a".repeat(12),
  });
  for (const bad of [
    "https://queuedrop.jamesrae-rosario18.workers.dev",
    "http://queuedrop-test.jamesrae-rosario18.workers.dev",
    "https://queuedrop-test.jamesrae-rosario18.workers.dev.evil.example",
    "https://queuedrop-test.jamesrae-rosario18.workers.dev/path",
    "https://queuedrop-test.jamesrae-rosario18.workers.dev/?x=1",
    "https://user:pass@queuedrop-test.jamesrae-rosario18.workers.dev",
    "https://queuedrop-test.jamesrae-rosario18.workers.dev:443",
  ]) {
    assert.throws(() => assertCloudflareTestConfiguration({ ...valid, baseUrl: bad }));
  }
  assert.throws(() => assertCloudflareTestConfiguration({
    ...valid, supabaseUrl: "https://sylvegfbkxgjfctbjfec.supabase.co",
  }));
  assert.throws(() => assertCloudflareTestConfiguration({ ...valid, sha: "a".repeat(12) }));
});

test("fails closed on stale revision or unhealthy database", () => {
  const healthy = { status: "ok", database: "ok", revision: "a".repeat(12) };
  assert.equal(assertCloudflareTestHealth(healthy, "a".repeat(12)), true);
  assert.throws(() => assertCloudflareTestHealth({ ...healthy, revision: "b".repeat(12) }, "a".repeat(12)));
  assert.throws(() => assertCloudflareTestHealth({ ...healthy, database: "not_checked" }, "a".repeat(12)));
  assert.throws(() => assertCloudflareTestHealth({ ...healthy, status: "degraded" }, "a".repeat(12)));
});

test("read-only fetch accepts only exact revision", async () => {
  const fakeFetch = async (url, opts) => {
    assert.equal(url, `${valid.baseUrl}/api/health`);
    assert.equal(opts.cache, "no-store");
    return { ok: true, json: async () => ({ status: "ok", database: "ok", revision: "a".repeat(12) }) };
  };
  assert.equal(await verifyCloudflareTestRevision(valid, fakeFetch), "a".repeat(12));
  await assert.rejects(
    verifyCloudflareTestRevision(valid, async () => ({ ok: false, status: 503 })),
    /HTTP 503/,
  );
});
