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


test("fresh authenticated account can atomically create first workspace with Starter trial", { skip: !(adminEnabled && anonKey) }, async () => {
  assertSafeTestUrl();
  const { createClient } = await import("@supabase/supabase-js");
  const admin = await adminClient();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `queuedrop-onboarding-${suffix}@example.com`;
  const password = `Qd!${suffix}Aa9`;
  let createdUserId = null;
  let createdBusinessId = null;

  try {
    const { data: createdAuth, error: createAuthError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "QueueDrop Onboarding Test" },
    });
    assert.equal(createAuthError, null, createAuthError?.message);
    createdUserId = createdAuth.user?.id ?? null;
    assert.ok(createdUserId, "temporary onboarding user was not created");

    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    assert.equal(signInError, null, signInError?.message);

    const { data: created, error: workspaceError } = await client.rpc("create_initial_business_workspace", {
      business_name: `Onboarding Test ${suffix}`,
      branch_name: "First Branch",
      branch_address: "Test Address",
      branch_phone: "09171234567",
    });
    assert.equal(workspaceError, null, workspaceError?.message);
    const workspace = Array.isArray(created) ? created[0] : created;
    createdBusinessId = workspace?.business_id ?? null;
    assert.ok(createdBusinessId, "workspace RPC did not return a business id");
    assert.ok(workspace?.branch_id, "workspace RPC did not return a branch id");

    const [{ data: membership, error: membershipError }, { data: subscription, error: subscriptionError }, { data: branch, error: branchError }] = await Promise.all([
      admin.from("business_users").select("role,is_active").eq("business_id", createdBusinessId).eq("user_id", createdUserId).single(),
      admin.from("business_subscriptions").select("status,plan_id,expires_at,plans(name)").eq("business_id", createdBusinessId).single(),
      admin.from("branches").select("id,name").eq("id", workspace.branch_id).single(),
    ]);

    assert.equal(membershipError, null, membershipError?.message);
    assert.equal(membership?.role, "owner");
    assert.notEqual(membership?.is_active, false);
    assert.equal(subscriptionError, null, subscriptionError?.message);
    assert.equal(subscription?.status, "trialing");
    const plan = Array.isArray(subscription?.plans) ? subscription.plans[0] : subscription?.plans;
    assert.equal(plan?.name, "Starter");
    assert.ok(subscription?.expires_at, "Starter trial must have an expiry");
    assert.equal(branchError, null, branchError?.message);
    assert.equal(branch?.name, "First Branch");

    const { error: duplicateBranchError } = await client.rpc("create_branch_with_defaults", {
      branch_name: "First Branch",
      branch_address: "Duplicate attempt",
      branch_phone: null,
    });
    assert.ok(duplicateBranchError, "duplicate branch creation must be rejected");

    const { data: firstService, error: firstServiceError } = await client.rpc("create_initial_branch_service", {
      target_branch_id: workspace.branch_id,
      service_name: "First Service",
      service_group: "Test",
      service_description: "Onboarding first service",
      service_queue_prefix: "FS",
      service_estimated_minutes: 15,
    });
    assert.equal(firstServiceError, null, firstServiceError?.message);
    const serviceSetup = Array.isArray(firstService) ? firstService[0] : firstService;
    assert.ok(serviceSetup?.business_service_id, "first service must create a catalog record");
    assert.ok(serviceSetup?.service_id, "first service must create the branch service");

    const { data: serviceLink, error: serviceLinkError } = await admin
      .from("branch_service_catalog")
      .select("business_service_id,branch_id,service_id")
      .eq("business_service_id", serviceSetup.business_service_id)
      .eq("branch_id", workspace.branch_id)
      .single();
    assert.equal(serviceLinkError, null, serviceLinkError?.message);
    assert.equal(serviceLink?.service_id, serviceSetup.service_id);

    const { data: accessState, error: accessError } = await client.rpc("get_subscription_access_state", {
      target_business_id: createdBusinessId,
    });
    assert.equal(accessError, null, accessError?.message);
    assert.equal(accessState, "trialing");

    await client.auth.signOut();
  } finally {
    if (createdBusinessId) await admin.from("businesses").delete().eq("id", createdBusinessId);
    if (createdUserId) await admin.auth.admin.deleteUser(createdUserId);
  }
});
