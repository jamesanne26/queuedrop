import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
assert.equal(process.env.QUEUEDROP_E2E_RUNNER_LOCAL, "true");
assert.equal(process.env.QUEUEDROP_TEST_BASE_URL, "http://127.0.0.1:3000");
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, "tcgiwtfhqssulxwawimh.supabase.co");
assert.ok(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "TEST anon key is required");
assert.equal(process.env.SMS_DRY_RUN, "true");
const expected = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12);
assert.ok(expected, "Exact checkout revision is required");
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch("http://127.0.0.1:3000/api/health", { signal: AbortSignal.timeout(5000) });
    const health = await response.json();
    if (response.ok && health.status === "ok" && health.database === "ok" && health.revision === expected) {
      console.log("PASS: runner-local production build matches checkout; TEST database is healthy");
      process.exit(0);
    }
  } catch { /* Server is still starting. */ }
  await delay(2000);
}
throw new Error("Runner-local app failed readiness or exact-revision verification");
