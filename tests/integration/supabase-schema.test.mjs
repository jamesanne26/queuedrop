import test from "node:test";
import assert from "node:assert/strict";

const url = process.env.QUEUEDROP_TEST_SUPABASE_URL;
const serviceKey = process.env.QUEUEDROP_TEST_SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.QUEUEDROP_TEST_SUPABASE_ANON_KEY;
const ownerEmail = process.env.E2E_OWNER_EMAIL;
const ownerPassword = process.env.E2E_OWNER_PASSWORD;
const forbiddenBusinessId = process.env.E2E_FORBIDDEN_BUSINESS_ID;
const requireIntegration = process.env.QUEUEDROP_REQUIRE_INTEGRATION === "1";

const adminMissing = [
  ["QUEUEDROP_TEST_SUPABASE_URL", url],
  ["QUEUEDROP_TEST_SUPABASE_SERVICE_ROLE_KEY", serviceKey],
].filter(([, value]) => !value).map(([name]) => name);

const rlsMissing = [
  ["QUEUEDROP_TEST_SUPABASE_URL", url],
  ["QUEUEDROP_TEST_SUPABASE_ANON_KEY", anonKey],
  ["E2E_OWNER_EMAIL", ownerEmail],
  ["E2E_OWNER_PASSWORD", ownerPassword],
  ["E2E_FORBIDDEN_BUSINESS_ID", forbiddenBusinessId],
].filter(([, value]) => !value).map(([name]) => name);

const adminEnabled = adminMissing.length === 0;
const rlsEnabled = rlsMissing.length === 0;

if (requireIntegration) {
  test("integration environment is fully configured", () => {
    const missing = [...new Set([...adminMissing, ...rlsMissing])];
    assert.deepEqual(missing, [], `Missing TEST-only environment variables: ${missing.join(", ")}`);
  });
}

function assertSafeTestUrl() {
  assert.ok(url, "QUEUEDROP_TEST_SUPABASE_URL is required");
  const parsed = new URL(url);
  assert.equal(parsed.protocol, "https:", "TEST Supabase URL must use HTTPS");
  assert.ok(parsed.hostname.endsWith(".supabase.co") || parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    `Unexpected TEST Supabase host: ${parsed.hostname}`);

  const appEnv = String(process.env.NEXT_PUBLIC_APP_ENV || "").toLowerCase();
  const appUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (["prod", "production"].includes(appEnv) && appUrl && appUrl === url) {
    assert.fail("Integration tests are refusing to use the production Supabase project.");
  }
}

async function adminClient() {
  assertSafeTestUrl();
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

test("TEST Supabase exposes QueueDrop core schema", { skip: !adminEnabled }, async () => {
  const supabase = await adminClient();
  const checks = [
    supabase.from("businesses").select("id,name,status,terminal_theme,terminal_logo_url,terminal_background_image_url").limit(1),
    supabase.from("branches").select("id,business_id,name,status").limit(1),
    supabase.from("services").select("id,branch_id,name,queue_prefix,is_active").limit(1),
    supabase.from("tickets").select("id,branch_id,service_id,status,ticket_number,sms_phone,sms_opted_in_at").limit(1),
    supabase.from("notifications").select("id,channel,status,attempt_count,next_attempt_at,processing_started_at,last_error,provider_message_id").limit(1),
    supabase.from("sms_delivery_methods").select("id,name,method_type,provider_code,country_code,is_enabled").limit(1),
    supabase.from("sms_routing_rules").select("id,scope_type,country_code,retry_limit,is_enabled").limit(1),
    supabase.from("sms_delivery_attempts").select("id,notification_id,status,attempt_number").limit(1),
    supabase.from("business_users").select("business_id,user_id,role,is_active").limit(1),
  ];
  const results = await Promise.all(checks);
  for (const result of results) assert.equal(result.error, null, result.error?.message);
});

test("invalid terminal token does not reveal terminal data", { skip: !adminEnabled }, async () => {
  const supabase = await adminClient();
  const { data, error } = await supabase.rpc("get_stub_terminal", { target_device_token: `00000000-0000-4000-8000-${String(Date.now()).padStart(12,"0").slice(-12)}` });
  assert.equal(error, null, error?.message);
  assert.equal(data, null);
});

test("authenticated owner cannot read an explicitly foreign business", { skip: !rlsEnabled }, async () => {
  assertSafeTestUrl();
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: authError } = await client.auth.signInWithPassword({ email: ownerEmail, password: ownerPassword });
  assert.equal(authError, null, authError?.message);
  const { data, error } = await client.from("businesses").select("id").eq("id", forbiddenBusinessId);
  assert.equal(error, null, error?.message);
  assert.deepEqual(data, []);
  await client.auth.signOut();
});

