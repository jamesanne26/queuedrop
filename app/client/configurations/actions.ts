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

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function fail(message: string): never {
  redirect(`/client/configurations?error=${encodeURIComponent(message)}`);
}

function success(message: string): never {
  redirect(`/client/configurations?message=${encodeURIComponent(message)}`);
}

function validateMobile(raw: string) {
  const phone = raw.trim();
  if (!phone) return null;
  return /^[0-9]+$/.test(phone) ? phone : null;
}

function phoneLoginEmail(phone: string) {
  const digest = createHash("sha256").update(phone).digest("hex");
  return `phone-${digest}@auth.queuedrop.invalid`;
}

function isPhoneLoginEmail(email: string) {
  return email.startsWith("phone-") && email.endsWith("@auth.queuedrop.invalid");
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

function branchIds(formData: FormData) {
  return [...new Set(formData.getAll("branch_ids").map(String).filter(Boolean))];
}

async function getClientAdminContext() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/auth/login?next=%2Fclient%2Fconfigurations");
  }

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, role")
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .in("role", ["owner", "admin"])
    .limit(1)
    .maybeSingle();

  if (!membership) fail("Only the business Owner or Admin can manage Client Configurations.");

  return {
    supabase,
    admin: createAdminClient(),
    actor: userData.user,
    businessId: membership.business_id as string,
    actorRole: membership.role as Role,
  };
}

async function validateBranches(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  role: Role,
  selected: string[],
) {
  if (role === "staff" && selected.length !== 1) {
    fail("Staff must be assigned to exactly one branch.");
  }
  if (role === "manager" && selected.length < 1) {
    fail("Managers must be assigned to at least one branch.");
  }

  if (!selected.length) return;
  const { data, error } = await supabase
    .from("branches")
    .select("id")
    .eq("business_id", businessId)
    .in("id", selected);

  if (error || (data?.length ?? 0) !== selected.length) {
    fail("One or more selected branches do not belong to this business.");
  }
}

export async function updateClientUserSettings(formData: FormData) {
  const userId = text(formData, "user_id");
  const fullName = text(formData, "full_name");
  const email = text(formData, "email").toLowerCase();
  const rawPhone = text(formData, "phone");
  const phone = validateMobile(rawPhone);
  const requestedRole = text(formData, "role") as Role;
  const active = text(formData, "is_active") === "true";
  const selectedBranches = branchIds(formData);
  const newPassword = text(formData, "new_password");

  if (!userId) fail("Missing user.");
  if (fullName.length < 2 || fullName.length > 100) {
    fail("Full name must be between 2 and 100 characters.");
  }
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
    fail("Enter a valid email address.");
  }
  if (rawPhone && !phone) fail("Mobile number must contain numbers only.");

  const { supabase, admin, actor, businessId } = await getClientAdminContext();

  const { data: targetMembership, error: membershipError } = await supabase
    .from("business_users")
    .select("id, role, is_active, can_view_queue_information_editing, can_view_position_notifications, can_set_branch_status, can_manage_services, can_manage_operating_hours, can_manage_team, can_manage_kiosk_display, can_add_customer, can_edit_customer, can_call_customer, can_serve_customer, can_complete_ticket, can_cancel_ticket, can_mark_no_show, can_view_customer_contact, can_view_reports, can_export_reports, can_view_audit_logs")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError || !targetMembership) fail("User was not found in this business.");

  const currentRole = targetMembership.role as Role;
  const protectedRole = currentRole === "owner" || currentRole === "admin";
  const nextRole: Role = protectedRole ? currentRole : requestedRole;

  if (!protectedRole && !["manager", "staff"].includes(nextRole)) {
    fail("Employees can only be assigned as Manager or Staff.");
  }

  if (["owner", "admin", "manager"].includes(nextRole) && !email) {
    fail(`${nextRole === "manager" ? "Manager" : nextRole === "owner" ? "Owner" : "Admin"} accounts require an email address.`);
  }
  if (["manager", "staff"].includes(nextRole) && !phone) {
    fail(`${nextRole === "manager" ? "Manager" : "Staff"} accounts require a mobile number.`);
  }

  if (newPassword) {
    if (protectedRole) fail("Owner/Admin passwords cannot be changed from this employee settings screen.");
    if (nextRole === "staff" && (newPassword.length < 6 || newPassword.length > 72)) {
      fail("Staff passwords must be between 6 and 72 characters.");
    }
    if (nextRole === "manager" && !validateManagerPassword(newPassword)) {
      fail("Manager passwords must be 10-72 characters and include uppercase, lowercase, number, and symbol.");
    }
  }

  if (!protectedRole) {
    await validateBranches(supabase, businessId, nextRole, selectedBranches);
  }

  const [profileResult, authResult, assignmentResult] = await Promise.all([
    admin.from("profiles").select("full_name, email, phone").eq("id", userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
    supabase.from("branch_users").select("branch_id").eq("user_id", userId),
  ]);

  if (authResult.error || !authResult.data.user) fail("Unable to find the user's login account.");

  const previousProfile = profileResult.data;
  const previousAuth = authResult.data.user;
  const previousBranches = (assignmentResult.data ?? []).map((row) => row.branch_id);

  if (phone && phone !== previousProfile?.phone) {
    const { data: duplicatePhone } = await admin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .neq("id", userId)
      .limit(1)
      .maybeSingle();
    if (duplicatePhone) fail("An account with this mobile number already exists.");
  }

  const previousVisibleEmail = String(previousProfile?.email ?? "").trim().toLowerCase();
  const previousAuthEmail = String(previousAuth.email ?? "").trim().toLowerCase();
  const currentVisibleEmail = isPhoneLoginEmail(previousVisibleEmail) ? "" : previousVisibleEmail;
  const currentRealAuthEmail = isPhoneLoginEmail(previousAuthEmail) ? "" : previousAuthEmail;
  const effectiveEmail = email || (nextRole === "staff" ? "" : currentVisibleEmail || currentRealAuthEmail);
  const effectivePhone = phone || "";

  const restoreDatabaseState = async () => {
    if (previousProfile) {
      await admin.from("profiles").update(previousProfile).eq("id", userId);
    }
    if (!protectedRole) {
      await supabase.rpc("manage_team_member", {
        target_user_id: userId,
        target_role: currentRole,
        target_branch_ids: previousBranches,
        target_active: targetMembership.is_active,
      });
    }
    await admin
      .from("business_users")
      .update({
        can_view_queue_information_editing: targetMembership.can_view_queue_information_editing,
        can_view_position_notifications: targetMembership.can_view_position_notifications,
        can_set_branch_status: targetMembership.can_set_branch_status,
        can_manage_services: targetMembership.can_manage_services,
        can_manage_operating_hours: targetMembership.can_manage_operating_hours,
        can_manage_team: targetMembership.can_manage_team,
        can_manage_kiosk_display: targetMembership.can_manage_kiosk_display,
        can_add_customer: targetMembership.can_add_customer,
        can_edit_customer: targetMembership.can_edit_customer,
        can_call_customer: targetMembership.can_call_customer,
        can_serve_customer: targetMembership.can_serve_customer,
        can_complete_ticket: targetMembership.can_complete_ticket,
        can_cancel_ticket: targetMembership.can_cancel_ticket,
        can_mark_no_show: targetMembership.can_mark_no_show,
        can_view_customer_contact: targetMembership.can_view_customer_contact,
        can_view_reports: targetMembership.can_view_reports,
        can_export_reports: targetMembership.can_export_reports,
        can_view_audit_logs: targetMembership.can_view_audit_logs,
      })
      .eq("business_id", businessId)
      .eq("user_id", userId);
  };

  const profileUpdate = await admin
    .from("profiles")
    .update({ full_name: fullName, email: effectiveEmail || null, phone: effectivePhone || null })
    .eq("id", userId);
  if (profileUpdate.error) fail(profileUpdate.error.message || "Unable to update the user profile.");

  if (!protectedRole) {
    const { error: memberUpdateError } = await supabase.rpc("manage_team_member", {
      target_user_id: userId,
      target_role: nextRole,
      target_branch_ids: selectedBranches,
      target_active: active,
    });
    if (memberUpdateError) {
      await restoreDatabaseState();
      fail(memberUpdateError.message || "Unable to update role or branch assignment.");
    }

    const permissionUpdate = await admin
      .from("business_users")
      .update({
        can_view_queue_information_editing: nextRole === "manager" && checked(formData, "queue_information_editing"),
        can_view_position_notifications: nextRole === "manager" && checked(formData, "position_notifications"),
        can_set_branch_status: nextRole === "manager" && checked(formData, "branch_status"),
        can_manage_services: nextRole === "manager" && checked(formData, "manage_services"),
        can_manage_operating_hours: nextRole === "manager" && checked(formData, "manage_operating_hours"),
        can_manage_team: nextRole === "manager" && checked(formData, "manage_team"),
        can_manage_kiosk_display: nextRole === "manager" && checked(formData, "manage_kiosk_display"),
        can_add_customer: checked(formData, "add_customer"),
        can_edit_customer: checked(formData, "edit_customer"),
        can_call_customer: checked(formData, "call_customer"),
        can_serve_customer: checked(formData, "serve_customer"),
        can_complete_ticket: checked(formData, "complete_ticket"),
        can_cancel_ticket: checked(formData, "cancel_ticket"),
        can_mark_no_show: checked(formData, "mark_no_show"),
        can_view_customer_contact: checked(formData, "view_customer_contact"),
        can_view_reports: nextRole === "manager" && checked(formData, "view_reports"),
        can_export_reports: nextRole === "manager" && checked(formData, "export_reports"),
        can_view_audit_logs: false,
      })
      .eq("business_id", businessId)
      .eq("user_id", userId);

    if (permissionUpdate.error) {
      await restoreDatabaseState();
      fail(permissionUpdate.error.message || "Unable to update configuration permissions.");
    }
  }

  const authEmail = effectiveEmail || (effectivePhone ? phoneLoginEmail(effectivePhone) : previousAuthEmail);
  const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, {
    email: authEmail,
    email_confirm: true,
    ...(newPassword ? { password: newPassword } : {}),
    user_metadata: {
      ...(previousAuth.user_metadata ?? {}),
      full_name: fullName,
      phone: effectivePhone || null,
      login_method: effectiveEmail ? "email" : "phone",
    },
  });

  if (authUpdateError) {
    await restoreDatabaseState();
    const message = authUpdateError.message || "Unable to update the login account.";
    if (message.toLowerCase().includes("already")) fail("An account with this email or mobile number already exists.");
    fail(message);
  }

  revalidatePath("/client/configurations");
  revalidatePath("/dashboard/team");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/branches");
  success(actor.id === userId ? "Your user settings were saved." : "User settings saved successfully.");
}

export async function deleteClientUser(formData: FormData) {
  const userId = text(formData, "user_id");
  const expectedName = text(formData, "expected_name");
  const confirmationName = text(formData, "confirmation_name");

  if (!userId) fail("Missing user.");
  if (!expectedName || confirmationName !== expectedName) {
    fail("The full-name confirmation did not match. User was not deleted.");
  }

  const { supabase, admin, actor, businessId } = await getClientAdminContext();
  if (actor.id === userId) fail("You cannot delete your own account.");

  const { data: target, error: targetError } = await supabase
    .from("business_users")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle();

  if (targetError || !target) fail("User was not found in this business.");
  if (["owner", "admin"].includes(target.role)) {
    fail("Owner and Admin accounts are protected and cannot be deleted here.");
  }

  const { error } = await supabase.rpc("delete_team_member", { target_user_id: userId });
  if (error) fail(error.message || "Unable to delete user.");

  const { count } = await admin
    .from("business_users")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((count ?? 0) === 0) {
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      fail("Business access was removed, but the login account could not be deleted.");
    }
  }

  revalidatePath("/client/configurations");
  revalidatePath("/dashboard/team");
  success("User deleted successfully.");
}
