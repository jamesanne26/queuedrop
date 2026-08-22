"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const TEAM_ROLES = new Set(["admin", "manager", "staff"]);

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function selectedBranches(formData: FormData) {
  return [...new Set(formData.getAll("branch_ids").map(String).filter(Boolean))];
}

function fail(message: string): never {
  redirect(`/dashboard/team?error=${encodeURIComponent(message)}`);
}

async function getAdminContext() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) redirect("/auth/login?next=%2Fdashboard%2Fteam");

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, role, is_active")
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .in("role", ["owner", "admin"])
    .limit(1)
    .maybeSingle();

  if (!membership) fail("Only business owners and admins can manage the team.");
  return { supabase, user: userData.user, membership };
}

async function validateBranchSelection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  role: string,
  branchIds: string[],
) {
  if ((role === "manager" || role === "staff") && branchIds.length === 0) {
    fail("Manager and staff roles require at least one branch assignment.");
  }

  if (!branchIds.length) return;

  const { data: branches, error } = await supabase
    .from("branches")
    .select("id")
    .eq("business_id", businessId)
    .in("id", branchIds);

  if (error || (branches?.length ?? 0) !== branchIds.length) {
    fail("One or more selected branches are invalid for this business.");
  }
}

export async function createTeamMember(formData: FormData) {
  const fullName = text(formData, "full_name");
  const email = text(formData, "email").toLowerCase();
  const phone = text(formData, "phone");
  const password = text(formData, "temporary_password");
  const role = text(formData, "role");
  const branchIds = selectedBranches(formData);

  if (fullName.length < 2 || fullName.length > 100) fail("Full name must be between 2 and 100 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fail("Enter a valid email address.");
  if (phone && !/^\+[1-9]\d{6,14}$/.test(phone)) fail("Use an international phone number such as +639171234567.");
  if (password.length < 10 || password.length > 72) fail("Temporary password must be between 10 and 72 characters.");
  if (!TEAM_ROLES.has(role)) fail("Invalid team role.");

  const { supabase, membership } = await getAdminContext();
  await validateBranchSelection(supabase, membership.business_id, role, branchIds);

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: phone || null },
  });

  if (createError || !created.user) {
    const message = createError?.message ?? "Unable to create the team member account.";
    if (message.toLowerCase().includes("already")) fail("An account with this email already exists.");
    fail(message);
  }

  const { error: membershipError } = await supabase.rpc("manage_team_member", {
    target_user_id: created.user.id,
    target_role: role,
    target_branch_ids: role === "admin" ? [] : branchIds,
    target_active: true,
  });

  if (membershipError) {
    await admin.auth.admin.deleteUser(created.user.id);
    fail(membershipError.message || "Unable to attach the new account to this business.");
  }

  revalidatePath("/dashboard/team");
  redirect(`/dashboard/team?message=${encodeURIComponent("Team member created successfully. Share the temporary password securely.")}`);
}

export async function updateTeamMember(formData: FormData) {
  const userId = text(formData, "user_id");
  const role = text(formData, "role");
  const active = text(formData, "is_active") === "true";
  const branchIds = selectedBranches(formData);

  if (!userId) fail("Missing team member.");
  if (!TEAM_ROLES.has(role)) fail("Invalid team role.");

  const { supabase, membership } = await getAdminContext();
  await validateBranchSelection(supabase, membership.business_id, role, branchIds);

  const { error } = await supabase.rpc("manage_team_member", {
    target_user_id: userId,
    target_role: role,
    target_branch_ids: role === "admin" ? [] : branchIds,
    target_active: active,
  });

  if (error) fail(error.message || "Unable to update team member.");

  revalidatePath("/dashboard/team");
  redirect(`/dashboard/team?message=${encodeURIComponent("Team member access updated.")}`);
}
