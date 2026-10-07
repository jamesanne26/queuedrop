import { createClient } from "@supabase/supabase-js";

const url = process.env.QUEUEDROP_TEST_SUPABASE_URL;
const key = process.env.QUEUEDROP_TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Dedicated TEST Supabase secrets are required.");
const admin = createClient(url, key, { auth: { persistSession: false } });
let ready = false;
const schemaDeadline = Date.now() + (process.env.CI ? 180_000 : 0);
do {
  const [tv, contact, schema, formatter, requests, fencing] = await Promise.all([
    admin.from("branch_tv_settings").select("branch_id,service_count,service_ids").limit(1),
    admin.from("platform_public_contact").select("id,phone").limit(1),
    admin.from("worker_runs").select("name").limit(1),
    admin.rpc("format_queue_number", { target_number: 1000 }),
    admin.from("stub_requests").select("request_id").limit(1),
    admin.from("print_jobs").select("reprint_generation").limit(1),
  ]);
  ready = !schema.error && !formatter.error && formatter.data === "1000" && !requests.error && !fencing.error && !tv.error && !contact.error;
  if (ready || Date.now() >= schemaDeadline) break;
  await new Promise(resolve => setTimeout(resolve, 10_000));
} while (Date.now() < schemaDeadline);
if (!ready) throw new Error("TEST reliability migration is missing or invalid. Apply pending QueueDrop migrations to TEST, then rerun this workflow.");
if (process.argv.includes("--schema-only")) { console.log("TEST reliability schema is ready."); process.exit(0); }
const base = process.env.QUEUEDROP_TEST_BASE_URL;
if (!base || new URL(base).hostname !== "queuedrop-test.vercel.app") throw new Error("Refusing to test an unrecognized deployment. Expected queuedrop-test.vercel.app.");
const expected = process.env.GITHUB_SHA?.slice(0,12);
if (!expected) throw new Error("GITHUB_SHA is required to verify this exact deployment.");
const deadline = Date.now() + 10 * 60_000;
while (Date.now() < deadline) {
  try {
    const response = await fetch(new URL("/api/health", base), { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    const health = await response.json();
    if (response.ok && health.status === "ok" && health.database === "ok" && health.revision === expected) {
      console.log(`TEST deployment ${expected} is ready, including database connectivity.`); process.exit(0);
    }
  } catch { /* Deployment may still be building. */ }
  await new Promise(resolve => setTimeout(resolve, 10_000));
}
throw new Error(`TEST deployment did not become ready at revision ${expected}. Refusing to test an older build.`);
