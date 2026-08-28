"use server";

import { createHash } from "node:crypto";
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
  if (!/^[0-9]+$/.test(phone)) return null;
  return phone;
}

function phoneLoginEmail(phone: string) {
  const digest = createHash("sha256").update(phone).digest("hex");
  return `phone-${digest}@auth.queuedrop.invalid`;
}

function isPhoneLoginEmail(email: string) {
  return email.startsWith("phone-") && email.endsWith("@auth.queuedrop.invalid");
}

function displayEmail(email: string | null | undefined) {
  const value = String(email ?? "").trim().toLowerCase();
  return isPhoneLoginEmail(value) ? null : value || null;
}

function validateManagerPassword(password: string) {
  return (
    password.length >= 10 &&
    password.length <= 72 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
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
    .select("business_id, role, is_active, can_manage_team")
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .in("role", ["owner", "admin", "manager"])
    .limit(1)
    .maybeSingle();

  if (!membership) {
    fail("You do not have permission to manage this team.");
  }

  const role = membership.role as Role;
  if (role === "manager" && !membership.can_manage_team) {
    fail("You do not have permission to manage this team.");
  }

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

  if (role === "manager" && !email) {
    fail("Manager accounts require an email address.", viewBranch);
  }

  if (!phone) {
    fail(
      role === "manager"
        ? "Manager accounts require a mobile number."
        : "Staff accounts require a mobile number.",
      viewBranch,
    );
  }

  if (
    email &&
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
  ) {
    fail("Enter a valid email address.", viewBranch);
  }

  if (rawPhone && !phone) {
    fail("Mobile number must contain numbers only.", viewBranch);
  }

  if (role === "staff") {
    if (password.length < 6 || password.length > 72) {
      fail(
        "Staff temporary passwords must be between 6 and 72 characters.",
        viewBranch,
      );
    }
  } else if (!validateManagerPassword(password)) {
    fail(
      "Manager temporary passwords must be 10-72 characters and include uppercase, lowercase, number, and symbol.",
      viewBranch,
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

  if (phone) {
    const { data: existingPhone } = await admin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();

    if (existingPhone) {
      fail("An account with this mobile number already exists.", viewBranch);
    }
  }

  // Supabase Auth requires phone identifiers to be E.164. QueueDrop stores
  // the business's mobile value independently and uses a private synthetic
  // Auth email for staff who choose mobile-only login, so local formats such
  // as 09171234567 are accepted without forcing E.164 formatting.
  const authEmail = email || (phone ? phoneLoginEmail(phone) : "");

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: authEmail,
      email_confirm: true,
      password,
      user_metadata: {
        full_name: fullName,
        phone: phone || null,
        login_method: email ? "email" : "phone",
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

  // Supabase requires a real Auth identifier. Phone-only staff use a private
  // synthetic Auth email, but QueueDrop must never expose that internal value
  // as the team member's actual email. Keep only the real email in profiles.
  const { error: profileEmailError } = await admin
    .from("profiles")
    .update({ email: email || null })
    .eq("id", created.user.id);

  if (profileEmailError) {
    await supabase.rpc("delete_team_member", {
      target_user_id: created.user.id,
    });
    await admin.auth.admin.deleteUser(created.user.id);
    fail(profileEmailError.message || "Unable to save the team member profile.", viewBranch);
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

export async function updateTeamMemberDetails(formData: FormData) {
  const viewBranch = text(formData, "view_branch");
  const userId = text(formData, "user_id");
  const fullName = text(formData, "full_name");
  const email = text(formData, "email").toLowerCase();
  const rawPhone = text(formData, "phone");
  const phone = validateMobile(rawPhone);
  const role = text(formData, "role");
  const active = text(formData, "is_active") === "true";
  const branchIds = selectedBranches(formData);
  const newPassword = text(formData, "new_password");

  if (!userId) fail("Missing team member.", viewBranch);

  if (fullName.length < 2 || fullName.length > 100) {
    fail("Full name must be between 2 and 100 characters.", viewBranch);
  }

  if (role === "manager" && !email) {
    fail("Manager accounts require an email address.", viewBranch);
  }

  if (!phone) {
    fail(
      role === "manager"
        ? "Manager accounts require a mobile number."
        : "Staff accounts require a mobile number.",
      viewBranch,
    );
  }

  if (
    email &&
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
  ) {
    fail("Enter a valid email address.", viewBranch);
  }

  if (rawPhone && !phone) {
    fail("Mobile number must contain numbers only.", viewBranch);
  }

  if (
    newPassword &&
    role === "staff" &&
    (newPassword.length < 6 || newPassword.length > 72)
  ) {
    fail("Staff passwords must be between 6 and 72 characters.", viewBranch);
  }

  if (newPassword && role === "manager" && !validateManagerPassword(newPassword)) {
    fail(
      "Manager passwords must be 10-72 characters and include uppercase, lowercase, number, and symbol.",
      viewBranch,
    );
  }

  const {
    supabase,
    user,
    membership,
    role: actorRole,
    managerBranchIds,
  } = await getTeamContext();

  const { data: targetMembership, error: targetMembershipError } =
    await supabase
      .from("business_users")
      .select("id, user_id, role, is_active")
      .eq("business_id", membership.business_id)
      .eq("user_id", userId)
      .maybeSingle();

  if (targetMembershipError || !targetMembership) {
    fail("Team member was not found.", viewBranch);
  }

  if (targetMembership.user_id === user.id) {
    fail("You cannot change your own team access from this screen.", viewBranch);
  }

  validateRequestedRole(actorRole, role);

  await validateBranchSelection(
    supabase,
    membership.business_id,
    actorRole,
    managerBranchIds,
    role,
    branchIds,
  );

  if (actorRole === "manager" && targetMembership.role !== "staff") {
    fail("Managers can manage staff accounts only.", viewBranch);
  }

  const admin = createAdminClient();
  const [targetAssignmentsResult, authLookup, profileLookup] = await Promise.all([
    supabase
      .from("branch_users")
      .select("branch_id")
      .eq("user_id", userId),
    admin.auth.admin.getUserById(userId),
    admin
      .from("profiles")
      .select("full_name, phone, email")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  if (actorRole === "manager") {
    const managerBranches = new Set(managerBranchIds);
    const targetInManagerBranch = (targetAssignmentsResult.data ?? []).some((row) =>
      managerBranches.has(row.branch_id),
    );
    if (!targetInManagerBranch) {
      fail("This staff member is outside your assigned branches.", viewBranch);
    }
  }

  const { data: authResult, error: authLookupError } = authLookup;
  if (authLookupError || !authResult.user) {
    fail("Unable to find the team member login account.", viewBranch);
  }

  const previousAuthEmail = authResult.user.email ?? "";
  const previousMetadata = authResult.user.user_metadata ?? {};
  const previousProfile = profileLookup.data;
  const previousBranchIds = (targetAssignmentsResult.data ?? []).map(
    (row) => row.branch_id,
  );

  const previousProfileEmail = displayEmail(previousProfile?.email);
  // For staff, blank means remove that optional contact method. For managers,
  // email has already been validated as required. Never persist QueueDrop's
  // private synthetic phone-login email as a visible profile email.
  const effectiveEmail = email || (role === "manager" ? previousProfileEmail ?? previousAuthEmail : "");
  const effectivePhone = phone || "";

  if (phone && phone !== previousProfile?.phone) {
    const { data: duplicatePhone } = await admin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .neq("id", userId)
      .limit(1)
      .maybeSingle();

    if (duplicatePhone) {
      fail("An account with this mobile number already exists.", viewBranch);
    }
  }

  const restoreDatabaseState = async () => {
    if (previousProfile) {
      await admin
        .from("profiles")
        .update(previousProfile)
        .eq("id", userId);
    }

    await supabase.rpc("manage_team_member", {
      target_user_id: userId,
      target_role: targetMembership.role,
      target_branch_ids: previousBranchIds,
      target_active: targetMembership.is_active,
    });
  };

  // Keep the database-side updates together. Auth is deliberately updated
  // after these succeed because passwords cannot be read back for rollback.
  const [profileUpdate, membershipUpdate] = await Promise.all([
    admin
      .from("profiles")
      .update({
        full_name: fullName,
        phone: phone || null,
        email: effectiveEmail || null,
      })
      .eq("id", userId),
    supabase.rpc("manage_team_member", {
      target_user_id: userId,
      target_role: role,
      target_branch_ids: branchIds,
      target_active: active,
    }),
  ]);

  if (profileUpdate.error || membershipUpdate.error) {
    await restoreDatabaseState();
    const message =
      profileUpdate.error?.message ||
      membershipUpdate.error?.message ||
      "Unable to update team member details.";
    if (message.toLowerCase().includes("already")) {
      fail("An account with this email or mobile number already exists.", viewBranch);
    }
    fail(message, viewBranch);
  }

  const authEmail = effectiveEmail || (effectivePhone ? phoneLoginEmail(effectivePhone) : "");

  const authUpdatePayload = {
    email: authEmail,
    email_confirm: true,
    ...(newPassword ? { password: newPassword } : {}),
    user_metadata: {
      ...previousMetadata,
      full_name: fullName,
      phone: effectivePhone || null,
      login_method: effectiveEmail ? "email" : "phone",
    },
  };

  const { error: authUpdateError } = await admin.auth.admin.updateUserById(
    userId,
    authUpdatePayload,
  );

  if (authUpdateError) {
    await restoreDatabaseState();
    const message = authUpdateError.message || "Unable to update login account.";
    if (message.toLowerCase().includes("already")) {
      fail("An account with this email or mobile number already exists.", viewBranch);
    }
    fail(message, viewBranch);
  }

  revalidatePath("/dashboard/team");
  redirect(
    teamUrl(
      viewBranch,
      "message",
      "Team member details updated successfully.",
    ),
  );
}

export async function deleteTeamMember(formData: FormData) {
  const viewBranch = text(formData, "view_branch");
  const userId = text(formData, "user_id");
  const expectedName = text(formData, "expected_name");
  const confirmationName = text(formData, "confirmation_name");

  if (!userId) {
    fail("Missing team member.", viewBranch);
  }

  if (!expectedName || confirmationName !== expectedName) {
    fail("The team member name confirmation did not match.", viewBranch);
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
