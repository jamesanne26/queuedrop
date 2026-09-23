import { createAdminClient, ensureE2ETerminalCapacity, getOwnerBusiness } from "./helpers/admin-db.mjs";

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

export default async function globalSetup() {
  const missing = REQUIRED_CI_ENV.filter((name) => !configured(name));
  if (missing.length) {
    if (process.env.CI) {
      throw new Error(`QueueDrop E2E preflight failed: missing GitHub Actions secrets: ${missing.join(", ")}`);
    }
    return;
  }

  const admin = createAdminClient();
  const email = process.env.E2E_OWNER_EMAIL.trim();
  const password = process.env.E2E_OWNER_PASSWORD;

  const owner = await getOwnerBusiness(admin, email);
  await ensureE2ETerminalCapacity(admin, owner.businessId);

  const { error: loginError } = await admin.auth.signInWithPassword({ email, password });
  if (loginError) {
    throw new Error(
      "QueueDrop E2E preflight failed: E2E_OWNER_EMAIL/E2E_OWNER_PASSWORD do not authenticate in QUEUEDROP_TEST_SUPABASE_URL.",
    );
  }
  await admin.auth.signOut();
}
