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
  if (!/^[0-9]+$/.test(phone)) return null;
  return phone;
}




function validateTeamPassword(password: string) {
  return password.length >= 6 && password.length <= 72;
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
  params.set("view", "users");
  return `/dashboard/settings?${params.toString()}`;
}

function fail(message: string, viewBranch = ""): never {
  redirect(teamUrl(viewBranch, "error", message));
}

async function getTeamContext() {
  const supabase = await createClient();
  const { data: userData, error: userError } =
    await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/auth/login?next=%2Fdashboard%2Fsettings");
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
  const customRoleName = text(formData, "custom_role_name");
  const businessRoleId = text(formData, "business_role_id");
  const branchIds = selectedBranches(formData);

  if (fullName.length < 2 || fullName.length > 100) {
    fail("Full name must be between 2 and 100 characters.", viewBranch);
  }
  if (customRoleName.length < 2 || customRoleName.length > 60) {
    fail("Employee role name must be between 2 and 60 characters.", viewBranch);
  }

  if (!email) {
    fail("Email is required for every QueueDrop user.", viewBranch);
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
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
  ) {
    fail("Enter a valid email address.", viewBranch);
  }

  if (rawPhone && !phone) {
    fail("Mobile number must contain numbers only.", viewBranch);
  }

  if (!validateTeamPassword(password)) {
    fail("Temporary passwords must be between 6 and 72 characters.", viewBranch);
  }

  const {
    supabase,
    membership,
    role: actorRole,
    managerBranchIds,
  } = await getTeamContext();

  validateRequestedRole(actorRole, role);

  if (!businessRoleId) {
    await validateBranchSelection(
      supabase,
      membership.business_id,
      actorRole,
      managerBranchIds,
      role,
      branchIds,
    );
  } else {
    const { data: selectedBusinessRole } = await supabase
      .from("roles")
      .select("id, base_role, name, branch_scope")
      .eq("id", businessRoleId)
      .eq("business_id", membership.business_id)
      .maybeSingle();
    if (!selectedBusinessRole || selectedBusinessRole.base_role !== role || selectedBusinessRole.name !== customRoleName) {
      fail("The selected employee role is invalid.", viewBranch);
    }
  }

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

  // QueueDrop uses email as the login identity for every team member.
  const authEmail = email;

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: authEmail,
      email_confirm: true,
      password,
      user_metadata: {
        full_name: fullName,
        phone: phone || null,
        login_method: "email",
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

  const { error: membershipError } = businessRoleId
    ? await supabase.rpc("manage_team_member_with_business_role", {
        target_user_id: created.user.id,
        target_role_id: businessRoleId,
        target_branch_ids: branchIds,
        target_active: true,
      })
    : await supabase.rpc("manage_team_member", {
        target_user_id: created.user.id,
        target_role: role,
        target_branch_ids: branchIds,
        target_active: true,
      });

  if (membershipError) {
    await admin.auth.admin.deleteUser(created.user.id);

    fail(
      membershipError.message ||
        "Unable to attach the new account to this business.",
    );
  }

  const [{ error: profileEmailError }, { error: customRoleError }] = await Promise.all([
    admin.from("profiles").update({ email }).eq("id", created.user.id),
    businessRoleId
      ? Promise.resolve({ error: null })
      : admin.from("business_users").update({ custom_role_name: customRoleName }).eq("business_id", membership.business_id).eq("user_id", created.user.id),
  ]);

  if (profileEmailError || customRoleError) {
    await supabase.rpc("delete_team_member", {
      target_user_id: created.user.id,
    });
    await admin.auth.admin.deleteUser(created.user.id);
    fail(profileEmailError?.message || customRoleError?.message || "Unable to save the team member profile or role.", viewBranch);
  }

  revalidatePath("/dashboard/team");

  redirect(
    teamUrl(
      viewBranch,
      "message",
      "Team member created successfully. They can sign in with their email and temporary password.",
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
  const businessRoleId = text(formData, "business_role_id");
  const active = text(formData, "is_active") === "true";
  let branchIds = selectedBranches(formData);
  const newPassword = text(formData, "new_password");

  if (!userId) fail("Missing team member.", viewBranch);

  if (fullName.length < 2 || fullName.length > 100) {
    fail("Full name must be between 2 and 100 characters.", viewBranch);
  }

  if (!email) {
    fail("Email is required for every QueueDrop user.", viewBranch);
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
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
  ) {
    fail("Enter a valid email address.", viewBranch);
  }

  if (rawPhone && !phone) {
    fail("Mobile number must contain numbers only.", viewBranch);
  }

  if (newPassword && !validateTeamPassword(newPassword)) {
    fail("Passwords must be between 6 and 72 characters.", viewBranch);
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
      .select("id, user_id, role, role_id, is_active")
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

  if (businessRoleId) {
    const { data: selectedBusinessRole } = await supabase
      .from("roles")
      .select("id, base_role, branch_scope")
      .eq("id", businessRoleId)
      .eq("business_id", membership.business_id)
      .maybeSingle();
    if (!selectedBusinessRole || selectedBusinessRole.base_role !== role) {
      fail("The assigned business role is invalid.", viewBranch);
    }
    if (selectedBusinessRole.branch_scope !== "all_branches" && branchIds.length > 1) {
      branchIds = branchIds.slice(0, 1);
    }
  } else {
    await validateBranchSelection(
      supabase,
      membership.business_id,
      actorRole,
      managerBranchIds,
      role,
      branchIds,
    );
  }

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

  const previousMetadata = authResult.user.user_metadata ?? {};
  const previousProfile = profileLookup.data;
  const previousBranchIds = (targetAssignmentsResult.data ?? []).map(
    (row) => row.branch_id,
  );

  // Email is the canonical QueueDrop login identity for every role. Legacy
  // phone-only accounts are converted to a real email login when edited.
  const effectiveEmail = email;
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

    if (targetMembership.role_id) {
      await supabase.rpc("manage_team_member_with_business_role", {
        target_user_id: userId,
        target_role_id: targetMembership.role_id,
        target_branch_ids: previousBranchIds,
        target_active: targetMembership.is_active,
      });
    } else {
      await supabase.rpc("manage_team_member", {
        target_user_id: userId,
        target_role: targetMembership.role,
        target_branch_ids: previousBranchIds,
        target_active: targetMembership.is_active,
      });
    }
  };

  // Keep the database-side updates together. Auth is deliberately updated
  // after these succeed because passwords cannot be read back for rollback.
  const [profileUpdate, membershipUpdate] = await Promise.all([
    admin
      .from("profiles")
      .update({
        full_name: fullName,
        phone: phone || null,
        email: effectiveEmail,
      })
      .eq("id", userId),
    businessRoleId
      ? supabase.rpc("manage_team_member_with_business_role", {
          target_user_id: userId,
          target_role_id: businessRoleId,
          target_branch_ids: branchIds,
          target_active: active,
        })
      : supabase.rpc("manage_team_member", {
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

  const authEmail = effectiveEmail;

  const authUpdatePayload = {
    email: authEmail,
    email_confirm: true,
    ...(newPassword ? { password: newPassword } : {}),
    user_metadata: {
      ...previousMetadata,
      full_name: fullName,
      phone: effectivePhone || null,
      login_method: "email",
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
  revalidatePath("/dashboard/settings");
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

export async function updateEmployeeAccess(formData: FormData) {
  const viewBranch = text(formData, "view_branch");
  const userId = text(formData, "user_id");
  const customRoleName = text(formData, "custom_role_name");
  if (!userId) fail("Missing team member.", viewBranch);
  if (customRoleName.length < 2 || customRoleName.length > 60) {
    fail("Role name must be between 2 and 60 characters.", viewBranch);
  }

  const { supabase, role: actorRole } = await getTeamContext();
  if (!['owner', 'admin'].includes(actorRole)) {
    fail("Only the business owner or admin can configure custom roles and permissions.", viewBranch);
  }

  const checked = (name: string) => text(formData, name) === "on";
  const { error } = await supabase.rpc("set_employee_access", {
    target_user_id: userId,
    target_custom_role_name: customRoleName,
    target_can_set_branch_status: checked("can_set_branch_status"),
    target_can_manage_services: checked("can_manage_services"),
    target_can_manage_operating_hours: checked("can_manage_operating_hours"),
    target_can_manage_team: checked("can_manage_team"),
    target_can_manage_kiosk_display: checked("can_manage_kiosk_display"),
    target_can_add_customer: false,
    target_can_edit_customer: false,
    target_can_call_customer: checked("can_call_customer"),
    target_can_serve_customer: checked("can_serve_customer"),
    target_can_complete_ticket: checked("can_complete_ticket"),
    target_can_cancel_ticket: checked("can_cancel_ticket"),
    target_can_mark_no_show: checked("can_mark_no_show"),
    target_can_view_customer_contact: checked("can_view_customer_contact"),
    target_can_view_reports: checked("can_view_reports"),
    target_can_export_reports: checked("can_export_reports"),
    target_can_view_audit_logs: checked("can_view_audit_logs"),
    target_can_view_queue_information_editing: checked("can_view_queue_information_editing"),
    target_can_view_position_notifications: checked("can_view_position_notifications"),
  });
  if (error) fail(error.message || "Unable to update employee access.", viewBranch);
  revalidatePath("/dashboard/team");
  revalidatePath("/dashboard/settings");
  redirect(teamUrl(viewBranch, "message", "Employee role and permissions updated."));
}

async function getRoleManagementContext() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/login?next=%2Fdashboard%2Fsettings%3Ftab%3Droles");

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, role, can_manage_roles")
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!membership) fail("You do not have permission to manage roles.");
  const actorRole = membership.role as Role;
  if (!["owner", "admin"].includes(actorRole) && !membership.can_manage_roles) {
    fail("You do not have permission to manage roles.");
  }

  return { supabase, membership, actorRole };
}

function rolesUrl(roleId?: string, key?: "message" | "error", message?: string) {
  const params = new URLSearchParams({ tab: "roles" });
  if (roleId) params.set("role", roleId);
  if (key && message) params.set(key, message);
  params.set("view", "roles");
  return `/dashboard/settings?${params.toString()}`;
}

export async function createBusinessRole(formData: FormData) {
  const name = text(formData, "name");
  const description = text(formData, "description");
  const branchScope = text(formData, "branch_scope");
  const baseRole: Role = branchScope === "own_branch_only" ? "staff" : "manager";
  const requestedPermissions = [...new Set(formData.getAll("permissions").map(String).filter(Boolean))];

  if (name.length < 2 || name.length > 60) redirect(rolesUrl(undefined, "error", "Role name must be between 2 and 60 characters."));
  if (!["own_branch_only", "selected_branches", "all_branches"].includes(branchScope)) redirect(rolesUrl(undefined, "error", "Choose a valid branch scope."));

  const { membership } = await getRoleManagementContext();
  const admin = createAdminClient();

  const { data: validPermissions } = await admin
    .from("permissions")
    .select("code")
    .in("code", requestedPermissions.length ? requestedPermissions : ["__none__"]);
  const validCodes = (validPermissions ?? []).map((row) => row.code);

  const { data: role, error: roleError } = await admin
    .from("roles")
    .insert({
      business_id: membership.business_id,
      name,
      description: description || null,
      base_role: baseRole,
      branch_scope: branchScope,
      is_system: false,
      is_protected: false,
    })
    .select("id")
    .single();

  if (roleError || !role) {
    const msg = roleError?.message?.toLowerCase().includes("duplicate")
      ? "A role with this name already exists."
      : roleError?.message || "Unable to create role.";
    redirect(rolesUrl(undefined, "error", msg));
  }

  if (validCodes.length) {
    const { error: permissionError } = await admin
      .from("role_permissions")
      .insert(validCodes.map((permission_code) => ({ role_id: role.id, permission_code })));
    if (permissionError) {
      await admin.from("roles").delete().eq("id", role.id);
      redirect(rolesUrl(undefined, "error", permissionError.message || "Unable to save role permissions."));
    }
  }

  revalidatePath("/dashboard/team");
  redirect(rolesUrl(role.id, "message", "Custom role created successfully."));
}

export async function updateBusinessRole(formData: FormData) {
  const roleId = text(formData, "role_id");
  const name = text(formData, "name");
  const description = text(formData, "description");
  const branchScope = text(formData, "branch_scope");
  const requestedPermissions = [...new Set(formData.getAll("permissions").map(String).filter(Boolean))];

  if (!roleId) redirect(rolesUrl(undefined, "error", "Missing role."));
  if (name.length < 2 || name.length > 60) redirect(rolesUrl(roleId, "error", "Role name must be between 2 and 60 characters."));
  if (!["own_branch_only", "selected_branches", "all_branches"].includes(branchScope)) redirect(rolesUrl(roleId, "error", "Choose a valid branch scope."));

  const { supabase, membership } = await getRoleManagementContext();
  const admin = createAdminClient();
  const { data: role } = await admin
    .from("roles")
    .select("id, business_id, is_protected, base_role")
    .eq("id", roleId)
    .eq("business_id", membership.business_id)
    .maybeSingle();

  if (!role) redirect(rolesUrl(undefined, "error", "Role was not found."));
  if (role.is_protected) redirect(rolesUrl(roleId, "error", "This system role is protected."));

  const { data: validPermissions } = await admin
    .from("permissions")
    .select("code")
    .in("code", requestedPermissions.length ? requestedPermissions : ["__none__"]);
  const validCodes = (validPermissions ?? []).map((row) => row.code);

  const nextBaseRole: Role = branchScope === "own_branch_only" ? "staff" : "manager";

  const { error: updateError } = await admin
    .from("roles")
    .update({ name, description: description || null, base_role: nextBaseRole, branch_scope: branchScope, updated_at: new Date().toISOString() })
    .eq("id", roleId)
    .eq("business_id", membership.business_id);
  if (updateError) redirect(rolesUrl(roleId, "error", updateError.message || "Unable to update role."));

  await admin.from("role_permissions").delete().eq("role_id", roleId);
  if (validCodes.length) {
    const { error: permissionError } = await admin
      .from("role_permissions")
      .insert(validCodes.map((permission_code) => ({ role_id: roleId, permission_code })));
    if (permissionError) redirect(rolesUrl(roleId, "error", permissionError.message || "Unable to update role permissions."));
  }

  const { data: assignedMembers } = await admin
    .from("business_users")
    .select("id")
    .eq("business_id", membership.business_id)
    .eq("role_id", roleId);

  for (const member of assignedMembers ?? []) {
    const { error } = await supabase.rpc("apply_business_role_to_user", {
      target_business_user_id: member.id,
      target_role_id: roleId,
    });
    if (error) redirect(rolesUrl(roleId, "error", error.message || "Role saved, but employee access could not be synchronized."));
  }

  revalidatePath("/dashboard/team");
  revalidatePath("/dashboard");
  redirect(rolesUrl(roleId, "message", "Role permissions updated successfully."));
}

export async function deleteBusinessRole(formData: FormData) {
  const roleId = text(formData, "role_id");
  if (!roleId) redirect(rolesUrl(undefined, "error", "Missing role."));

  const { membership } = await getRoleManagementContext();
  const admin = createAdminClient();
  const { data: role } = await admin.from("roles")
    .select("id, name, business_id, is_protected")
    .eq("id", roleId)
    .eq("business_id", membership.business_id)
    .maybeSingle();
  if (!role) redirect(rolesUrl(undefined, "error", "Role was not found."));
  if (role.is_protected) redirect(rolesUrl(roleId, "error", "This system role is protected."));

  const { count } = await admin.from("business_users")
    .select("id", { count: "exact", head: true })
    .eq("business_id", membership.business_id)
    .eq("role_id", roleId);
  if ((count ?? 0) > 0) redirect(rolesUrl(roleId, "error", "Reassign users from this role before deleting it."));

  await admin.from("role_permissions").delete().eq("role_id", roleId);
  const { error } = await admin.from("roles").delete().eq("id", roleId).eq("business_id", membership.business_id);
  if (error) redirect(rolesUrl(roleId, "error", error.message || "Unable to delete role."));

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/team");
  redirect(rolesUrl(undefined, "message", "Custom role deleted successfully."));
}

export async function assignBusinessRoleToEmployee(formData: FormData) {
  const businessUserId = text(formData, "business_user_id");
  const roleId = text(formData, "role_id");
  const viewBranch = text(formData, "view_branch");
  if (!businessUserId || !roleId) fail("Missing employee role assignment.", viewBranch);

  const { supabase } = await getTeamContext();
  const { error } = await supabase.rpc("apply_business_role_to_user", {
    target_business_user_id: businessUserId,
    target_role_id: roleId,
  });
  if (error) fail(error.message || "Unable to assign role.", viewBranch);

  revalidatePath("/dashboard/team");
  redirect(teamUrl(viewBranch, "message", "Employee role updated successfully."));
}

const directPermissionColumns = [
  "can_view_queue_information_editing",
  "can_view_position_notifications",
  "can_set_branch_status",
  "can_manage_services",
  "can_manage_operating_hours",
  "can_manage_team",
  "can_manage_kiosk_display",
  "can_add_customer",
  "can_edit_customer",
  "can_call_customer",
  "can_serve_customer",
  "can_complete_ticket",
  "can_cancel_ticket",
  "can_mark_no_show",
  "can_view_customer_contact",
  "can_view_reports",
  "can_export_reports",
  "can_view_audit_logs",
] as const;

export async function updateTeamMemberAccess(formData: FormData) {
  const businessUserId = text(formData, "business_user_id");
  const targetUserId = text(formData, "user_id");
  const viewBranch = text(formData, "view_branch") || "all";
  if (!businessUserId || !targetUserId) fail("Missing user access record.", viewBranch);

  const { supabase, membership, role: actorRole } = await getTeamContext();
  const { data: target } = await supabase.from("business_users")
    .select("id,user_id,role")
    .eq("id", businessUserId)
    .eq("user_id", targetUserId)
    .eq("business_id", membership.business_id)
    .maybeSingle();
  if (!target) fail("User was not found.", viewBranch);
  if (["owner", "admin"].includes(target.role)) fail("Owner and admin access is protected here.", viewBranch);
  if (actorRole === "manager" && target.role !== "staff") fail("Managers can manage staff accounts only.", viewBranch);

  const permissionUpdate: Record<string, boolean> = {};
  for (const column of directPermissionColumns) permissionUpdate[column] = formData.get(column) === "on";
  const { error: permissionError } = await supabase.from("business_users")
    .update(permissionUpdate)
    .eq("id", businessUserId)
    .eq("business_id", membership.business_id);
  if (permissionError) fail(permissionError.message || "Unable to save user permissions.", viewBranch);

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/team");
  redirect(teamUrl(viewBranch, "message", "User permissions saved."));
}

export async function updateBranchUserAssignment(formData: FormData) {
  const branchId = text(formData, "branch_id");
  const userId = text(formData, "user_id");
  const mode = text(formData, "mode");
  if (!branchId || !userId || !["add", "remove"].includes(mode)) fail("Missing branch user update.", branchId);

  const { supabase, membership, role: actorRole, managerBranchIds } = await getTeamContext();
  const { data: branch } = await supabase.from("branches").select("id").eq("id", branchId).eq("business_id", membership.business_id).maybeSingle();
  if (!branch) fail("Branch was not found.", branchId);
  if (actorRole === "manager" && !managerBranchIds.includes(branchId)) fail("You can manage users only in your assigned branches.", branchId);

  const { data: candidate, error: candidateError } = await supabase.from("business_users")
    .select("user_id,role,role_id,custom_role_name")
    .eq("business_id", membership.business_id)
    .eq("user_id", userId)
    .in("role", actorRole === "manager" ? ["staff"] : ["manager", "staff"])
    .maybeSingle();
  if (candidateError || !candidate) fail("This user cannot be assigned to the branch.", branchId);

  if (mode === "remove") {
    const { error } = await supabase.from("branch_users").delete().eq("branch_id", branchId).eq("user_id", userId);
    if (error) fail(error.message || "Unable to remove user from branch.", branchId);
  } else {
    let branchScope: "own_branch_only" | "selected_branches" | "all_branches" = candidate.role === "staff" ? "own_branch_only" : "all_branches";
    if (candidate.role_id) {
      const { data: declaredRole } = await supabase.from("roles").select("branch_scope").eq("id", candidate.role_id).eq("business_id", membership.business_id).maybeSingle();
      if (declaredRole?.branch_scope) branchScope = declaredRole.branch_scope as typeof branchScope;
    }
    if (branchScope !== "all_branches") {
      const { data: businessBranches } = await supabase.from("branches").select("id").eq("business_id", membership.business_id);
      const businessBranchIds = (businessBranches ?? []).map((row) => row.id);
      const { data: existingAssignments } = businessBranchIds.length
        ? await supabase.from("branch_users").select("branch_id").eq("user_id", userId).in("branch_id", businessBranchIds)
        : { data: [] as { branch_id: string }[] };
      if ((existingAssignments ?? []).some((row) => row.branch_id !== branchId)) {
        fail("This role is limited to one branch. Remove the user from the current branch before assigning another.", branchId);
      }
    }
    const { error } = await supabase.from("branch_users").upsert({ user_id: userId, branch_id: branchId }, { onConflict: "branch_id,user_id" });
    if (error) fail(error.message || "Unable to add user to branch.", branchId);
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/team");
  redirect(`/dashboard/settings?branch=${encodeURIComponent(branchId)}&view=branch-users&message=${encodeURIComponent(mode === "add" ? "User added to branch." : "User removed from branch.")}`);
}
