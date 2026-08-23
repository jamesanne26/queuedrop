"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Role = "owner" | "admin" | "manager" | "staff";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}


function validateMobile(raw: string) {
  const phone = raw.trim();
  if (!phone) return null;
  if (!/^[0-9]{1,20}$/.test(phone)) return null;
  return phone;
}

function selectedBranches(formData: FormData) {
  return [
    ...new Set(
      formData.getAll("branch_ids").map(String).filter(Boolean),
    ),
  ];
}

function teamUrl(
  viewBranch: string,
  key: "message" | "error",
  message: string,
) {
  const params = new URLSearchParams();
  if (viewBranch && viewBranch !== "all") {
    params.set("branch", viewBranch);
  }
  params.set(key, message);
  return `/dashboard/team?${params.toString()}`;
}

function fail(message: string, viewBranch = ""): never {
  redirect(teamUrl(viewBranch, "error", message));
}

async function getTeamContext() {
  const supabase = await createClient();
  const { data: userData, error: userError } =
    await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/auth/login?next=%2Fdashboard%2Fteam");
  }

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, role, is_active")
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .in("role", ["owner", "admin", "manager"])
    .limit(1)
    .maybeSingle();

  if (!membership) {
    fail("You do not have permission to manage this team.");
  }

  const role = membership.role as Role;

  const { data: managerAssignments } =
    role === "manager"
      ? await supabase
          .from("branch_users")
          .select("branch_id")
          .eq("user_id", userData.user.id)
      : { data: [] as { branch_id: string }[] };

  return {
    supabase,
    user: userData.user,
    membership,
    role,
    managerBranchIds: (managerAssignments ?? []).map(
      (row) => row.branch_id,
    ),
  };
}

function validateRequestedRole(actorRole: Role, targetRole: string) {
  if (actorRole === "manager") {
    if (targetRole !== "staff") {
      fail("Managers can manage staff accounts only.");
    }
    return;
  }

  if (!["manager", "staff"].includes(targetRole)) {
    fail("Owners/admins can manage manager and staff accounts only.");
  }
}

async function validateBranchSelection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  actorRole: Role,
  managerBranchIds: string[],
  role: string,
  branchIds: string[],
) {
  if (role === "staff" && branchIds.length !== 1) {
    fail("Staff must be assigned to exactly one branch.");
  }

  if (role === "manager" && branchIds.length === 0) {
    fail("Manager role requires at least one branch assignment.");
  }

  if (!branchIds.length) return;

  const { data: branches, error } = await supabase
    .from("branches")
    .select("id")
    .eq("business_id", businessId)
    .in("id", branchIds);

  if (
    error ||
    (branches?.length ?? 0) !== branchIds.length
  ) {
    fail("One or more selected branches are invalid for this business.");
  }

  if (actorRole === "manager") {
    const allowed = new Set(managerBranchIds);
    const invalid = branchIds.some((id) => !allowed.has(id));

    if (invalid) {
      fail("Managers can assign staff only to their own branches.");
    }
  }
}

export async function createTeamMember(formData: FormData) {
  const viewBranch = text(formData, "view_branch");
  const fullName = text(formData, "full_name");
  const email = text(formData, "email").toLowerCase();
  const rawPhone = text(formData, "phone");
  const phone = validateMobile(rawPhone);
  const password = text(formData, "temporary_password");
  const role = text(formData, "role");
  const branchIds = selectedBranches(formData);

  if (fullName.length < 2 || fullName.length > 100) {
    fail("Full name must be between 2 and 100 characters.", viewBranch);
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254
  ) {
    fail("Enter a valid email address.", viewBranch);
  }

  if (rawPhone && !phone) {
    fail("Mobile number must contain numbers only.", viewBranch);
  }

  if (password.length < 10 || password.length > 72) {
    fail(
      "Temporary password must be between 10 and 72 characters.",
    );
  }

  const {
    supabase,
    membership,
    role: actorRole,
    managerBranchIds,
  } = await getTeamContext();

  validateRequestedRole(actorRole, role);

  await validateBranchSelection(
    supabase,
    membership.business_id,
    actorRole,
    managerBranchIds,
    role,
    branchIds,
  );

  const admin = createAdminClient();

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone: phone || null,
      },
    });

  if (createError || !created.user) {
    const message =
      createError?.message ??
      "Unable to create the team member account.";

    if (message.toLowerCase().includes("already")) {
      fail("An account with this email already exists.");
    }

    fail(message);
  }

  const { error: membershipError } = await supabase.rpc(
    "manage_team_member",
    {
      target_user_id: created.user.id,
      target_role: role,
      target_branch_ids: branchIds,
      target_active: true,
    },
  );

  if (membershipError) {
    await admin.auth.admin.deleteUser(created.user.id);

    fail(
      membershipError.message ||
        "Unable to attach the new account to this business.",
    );
  }

  revalidatePath("/dashboard/team");

  redirect(
    teamUrl(
      viewBranch,
      "message",
      "Team member created successfully. Share the temporary password securely.",
    ),
  );
}

export async function updateTeamMember(formData: FormData) {
  const viewBranch = text(formData, "view_branch");
  const userId = text(formData, "user_id");
  const role = text(formData, "role");
  const active = text(formData, "is_active") === "true";
  const branchIds = selectedBranches(formData);

  if (!userId) {
    fail("Missing team member.", viewBranch);
  }

  const {
    supabase,
    membership,
    role: actorRole,
    managerBranchIds,
  } = await getTeamContext();

  validateRequestedRole(actorRole, role);

  await validateBranchSelection(
    supabase,
    membership.business_id,
    actorRole,
    managerBranchIds,
    role,
    branchIds,
  );

  const { error } = await supabase.rpc("manage_team_member", {
    target_user_id: userId,
    target_role: role,
    target_branch_ids: branchIds,
    target_active: active,
  });

  if (error) {
    fail(error.message || "Unable to update team member.");
  }

  revalidatePath("/dashboard/team");

  redirect(
    teamUrl(viewBranch, "message", "Team member access updated."),
  );
}

export async function deleteTeamMember(formData: FormData) {
  const viewBranch = text(formData, "view_branch");
  const userId = text(formData, "user_id");

  if (!userId) {
    fail("Missing team member.", viewBranch);
  }

  const { supabase } = await getTeamContext();

  const { error } = await supabase.rpc("delete_team_member", {
    target_user_id: userId,
  });

  if (error) {
    fail(error.message || "Unable to delete team member.");
  }

  const admin = createAdminClient();

  const { count } = await admin
    .from("business_users")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((count ?? 0) === 0) {
    const { error: deleteAuthError } =
      await admin.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      fail(
        "Business access was removed, but the Auth account could not be deleted.",
      );
    }
  }

  revalidatePath("/dashboard/team");

  redirect(
    teamUrl(viewBranch, "message", "Team member deleted."),
  );
}
