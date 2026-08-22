"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function fail(message: string): never {
  redirect(`/dashboard/branches?error=${encodeURIComponent(message)}`);
}

function success(message: string): never {
  redirect(`/dashboard/branches?message=${encodeURIComponent(message)}`);
}

function validateBranchFields(name: string, address: string, phone: string) {
  if (name.length < 2 || name.length > 120) {
    fail("Branch name must be between 2 and 120 characters.");
  }
  if (address.length > 300) {
    fail("Address must be 300 characters or fewer.");
  }
  if (phone.length > 32) {
    fail("Phone must be 32 characters or fewer.");
  }
  if (phone && !/^[0-9+() .-]{7,32}$/.test(phone)) {
    fail("Phone contains invalid characters.");
  }
}

async function getOwnerContext() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/auth/login?next=%2Fdashboard%2Fbranches");
  }

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, role, is_active")
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .in("role", ["owner", "admin"])
    .limit(1)
    .maybeSingle();

  if (!membership) {
    fail("Only the business owner/admin can manage branches.");
  }

  return { supabase, membership };
}

export async function createBranch(formData: FormData) {
  const name = value(formData, "name");
  const address = value(formData, "address");
  const phone = value(formData, "phone");

  validateBranchFields(name, address, phone);

  const { supabase } = await getOwnerContext();

  const { error } = await supabase.rpc("create_branch_with_defaults", {
    branch_name: name,
    branch_address: address || null,
    branch_phone: phone || null,
  });

  if (error) {
    if (
      error.code === "23505" ||
      error.message.toLowerCase().includes("duplicate")
    ) {
      fail("A branch with that name already exists in this business.");
    }
    fail(error.message || "Unable to create branch.");
  }

  revalidatePath("/dashboard/branches");
  success("Branch created successfully.");
}

export async function updateBranch(formData: FormData) {
  const branchId = value(formData, "branch_id");
  const name = value(formData, "name");
  const address = value(formData, "address");
  const phone = value(formData, "phone");
  const status = value(formData, "status");

  if (!branchId) fail("Missing branch.");
  validateBranchFields(name, address, phone);

  if (!["active", "inactive"].includes(status)) {
    fail("Invalid branch status.");
  }

  const { supabase, membership } = await getOwnerContext();

  const { data: branch } = await supabase
    .from("branches")
    .select("id")
    .eq("id", branchId)
    .eq("business_id", membership.business_id)
    .maybeSingle();

  if (!branch) fail("Branch not found in this business.");

  // Keep slug stable so existing QR/public queue URLs do not break when
  // the display name changes.
  const { error } = await supabase
    .from("branches")
    .update({
      name,
      address: address || null,
      phone: phone || null,
      status,
    })
    .eq("id", branchId)
    .eq("business_id", membership.business_id);

  if (error) {
    fail(error.message || "Unable to update branch.");
  }

  revalidatePath("/dashboard/branches");
  revalidatePath("/dashboard/settings");
  success("Branch updated successfully.");
}

export async function deleteBranch(formData: FormData) {
  const branchId = value(formData, "branch_id");
  if (!branchId) fail("Missing branch.");

  const { supabase, membership } = await getOwnerContext();

  const { data: branch } = await supabase
    .from("branches")
    .select("id, name")
    .eq("id", branchId)
    .eq("business_id", membership.business_id)
    .maybeSingle();

  if (!branch) fail("Branch not found in this business.");

  // Hard-deleting a branch cascades into queue/service data in the current
  // schema. Protect branches that already have tickets/history.
  const { count: ticketCount } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("branch_id", branchId);

  if ((ticketCount ?? 0) > 0) {
    fail(
      "This branch already has queue history and cannot be deleted. Set it to Inactive instead.",
    );
  }

  const { error } = await supabase
    .from("branches")
    .delete()
    .eq("id", branchId)
    .eq("business_id", membership.business_id);

  if (error) {
    fail(error.message || "Unable to delete branch.");
  }

  revalidatePath("/dashboard/branches");
  revalidatePath("/dashboard/settings");
  success(`${branch.name} deleted successfully.`);
}
