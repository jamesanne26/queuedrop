import { createClient } from "@supabase/supabase-js";
import { requiredEnv } from "./env.mjs";

export function createAdminClient() {
  return createClient(
    requiredEnv("QUEUEDROP_TEST_SUPABASE_URL"),
    requiredEnv("QUEUEDROP_TEST_SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function getOwnerBusiness(admin, ownerEmail) {
  let page = 1;
  let user = null;

  while (!user && page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    user = data.users.find((candidate) => candidate.email?.toLowerCase() === ownerEmail.toLowerCase()) ?? null;
    if (user || data.users.length < 100) break;
    page += 1;
  }

  if (!user) throw new Error(`E2E owner was not found in TEST Supabase: ${ownerEmail}`);

  const { data: memberships, error } = await admin
    .from("business_users")
    .select("business_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(10);
  if (error) throw error;

  const membership = memberships?.find((item) => item.role === "owner") ?? memberships?.[0] ?? null;
  if (!membership?.business_id) throw new Error("E2E owner has no active TEST business membership.");

  return { userId: user.id, businessId: membership.business_id, role: membership.role };
}

export async function findBranchByName(admin, businessId, name) {
  const { data, error } = await admin
    .from("branches")
    .select("id, name, business_id")
    .eq("business_id", businessId)
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function findServiceByName(admin, branchId, name) {
  const { data, error } = await admin
    .from("services")
    .select("id, name, branch_id")
    .eq("branch_id", branchId)
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function cleanupOwnedBranch(admin, businessId, branchName) {
  const branch = await findBranchByName(admin, businessId, branchName);
  if (!branch) return;

  // All branch-owned QueueDrop records use ON DELETE CASCADE. Deleting the
  // scenario-owned branch directly keeps cleanup independent from UI state and
  // avoids stale fixtures if a test aborts midway.
  const { error } = await admin
    .from("branches")
    .delete()
    .eq("id", branch.id)
    .eq("business_id", businessId);
  if (error) throw error;

  const leftover = await findBranchByName(admin, businessId, branchName);
  if (leftover) throw new Error(`E2E cleanup failed for branch: ${branchName}`);
}
