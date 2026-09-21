export function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required E2E environment variable: ${name}`);
  return value;
}

export function ownerCredentials() {
  const email = process.env.E2E_OWNER_EMAIL?.trim();
  const password = process.env.E2E_OWNER_PASSWORD?.trim();
  return email && password ? { email, password } : null;
}

export function hasAdminTestEnvironment() {
  return Boolean(
    process.env.QUEUEDROP_TEST_SUPABASE_URL?.trim() &&
    process.env.QUEUEDROP_TEST_SUPABASE_SERVICE_ROLE_KEY?.trim() &&
    process.env.E2E_OWNER_EMAIL?.trim(),
  );
}
