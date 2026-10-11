import { createAdminClient, ensureE2ETerminalCapacity, getOwnerBusiness } from "./helpers/admin-db.mjs";

import { assertDedicatedTestProject, ensureE2ESubscriptionAccess } from "./helpers/subscription-fixture.mjs";

const REQUIRED_CI_ENV = [
  "QUEUEDROP_TEST_BASE_URL",
  "E2E_OWNER_EMAIL",
  "E2E_OWNER_PASSWORD",
  "QUEUEDROP_TEST_SUPABASE_URL",
  "QUEUEDROP_TEST_SUPABASE_SERVICE_ROLE_KEY",
];

function configured(name) {
  const value = process.env[name]?.trim();
  return Boolean(value && !value.includes("YOUR_"));
}

async function ensureOwnerBusiness(admin, email, password) {
  try {
    return await getOwnerBusiness(admin, email);
  } catch (error) {
    const message = String(error?.message ?? error);
    const missingUser = message.includes("E2E owner was not found in TEST Supabase");
    const missingMembership = message.includes("E2E owner has no active TEST business membership");
    if (!missingUser && !missingMembership) throw error;

    if (missingUser) {
      const { error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "QueueDrop E2E Owner" },
      });
      if (createError) {
        throw new Error(`QueueDrop E2E preflight failed to create the dedicated TEST owner: ${createError.message}`);
      }
    }

    const { error: loginError } = await admin.auth.signInWithPassword({ email, password });
    if (loginError) {
      throw new Error(
        "QueueDrop E2E preflight failed: E2E_OWNER_EMAIL/E2E_OWNER_PASSWORD do not authenticate in QUEUEDROP_TEST_SUPABASE_URL.",
      );
    }

    const suffix = Date.now();
    let workspaceResult;
    try {
      workspaceResult = await admin.rpc("create_initial_business_workspace", {
        business_name: `QueueDrop E2E ${suffix}`,
        branch_name: `E2E Branch ${suffix}`,
        branch_address: "Automated Test Environment",
        branch_phone: null,
      });
    } finally {
      await admin.auth.signOut({ scope: "local" });
    }

    if (workspaceResult.error) {
      throw new Error(`QueueDrop E2E preflight failed to create a TEST workspace: ${workspaceResult.error.message}`);
    }

    return getOwnerBusiness(admin, email);
  }
}

export default async function globalSetup() {
  const missing = REQUIRED_CI_ENV.filter((name) => !configured(name));
  if (missing.length) {
    if (process.env.CI) {
      throw new Error(`QueueDrop E2E preflight failed: missing GitHub Actions secrets: ${missing.join(", ")}`);
    }
    return;
  }

  assertDedicatedTestProject(process.env.QUEUEDROP_TEST_SUPABASE_URL);
  const admin = createAdminClient();
  const email = process.env.E2E_OWNER_EMAIL.trim();
  const password = process.env.E2E_OWNER_PASSWORD;

  const owner = await ensureOwnerBusiness(admin, email, password);
  await ensureE2ESubscriptionAccess(admin, owner, process.env.QUEUEDROP_TEST_SUPABASE_URL);
  await ensureE2ETerminalCapacity(admin, owner.businessId);

  const { error: loginError } = await admin.auth.signInWithPassword({ email, password });
  if (loginError) {
    throw new Error(
      "QueueDrop E2E preflight failed: E2E_OWNER_EMAIL/E2E_OWNER_PASSWORD do not authenticate in QUEUEDROP_TEST_SUPABASE_URL.",
    );
  }
  await admin.auth.signOut({ scope: "local" });
}
