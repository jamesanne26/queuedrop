import { createAdminClient } from "./helpers/admin-db.mjs";
import { assertDedicatedTestProject } from "./helpers/subscription-fixture.mjs";

// Only delete the single disposable TEST owner belonging to this workflow run.
// Never touch shared fixture accounts, real customers, or production projects.
const runId = process.env.GITHUB_RUN_ID?.trim();
const email = process.env.E2E_OWNER_EMAIL?.trim().toLowerCase();
if (!runId || !email) {
  console.log("No CI-only owner was created; cleanup not required.");
  process.exit(0);
}
if (process.env.CI !== "true" || email !== `cloudflare-e2e-${runId}@example.com`) {
  throw new Error("Refusing E2E cleanup: run-specific CI owner identity does not match.");
}
assertDedicatedTestProject(process.env.QUEUEDROP_TEST_SUPABASE_URL);
const admin = createAdminClient();
let user = null;
for (let page = 1; page <= 25 && !user; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw error;
  user = data.users.find((candidate) => candidate.email?.toLowerCase() === email) ?? null;
  if (data.users.length < 100) break;
}
if (!user) {
  console.log("Disposable CI owner already absent.");
} else {
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
  console.log("Deleted disposable TEST owner and invalidated its active sessions.");
}
