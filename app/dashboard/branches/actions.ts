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

async function ownerAdminContext(targetBranchId?: string) {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/auth/login?next=%2Fdashboard%2Fbranches");
  }

  const { data: businessId, error: businessError } = targetBranchId
    ? await supabase.rpc("get_admin_business_id_for_branch", {
        target_branch_id: targetBranchId,
      })
    : await supabase.rpc("get_current_admin_business_id");

  if (businessError || !businessId) {
    fail("Only the business owner/admin can manage branches.");
  }

  return { supabase, businessId };
}

function validateBranchFields(name: string, address: string, phone: string) {
  if (name.length < 2 || name.length > 120) fail("Branch name must be between 2 and 120 characters.");
  if (address.length > 300) fail("Address must be 300 characters or fewer.");
  if (phone.length > 20) fail("Phone must be 20 digits or fewer.");
  if (phone && !/^[0-9]{7,20}$/.test(phone)) fail("Phone must contain numbers only.");
}

export async function createBranch(formData: FormData) {
  const name = value(formData, "name");
  const address = value(formData, "address");
  const phone = value(formData, "phone");
  validateBranchFields(name, address, phone);

  const { supabase } = await ownerAdminContext();
  const { error } = await supabase.rpc("create_branch_with_defaults", {
    branch_name: name,
    branch_address: address || null,
    branch_phone: phone || null,
  });

  if (error) {
    if (error.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
      fail("A branch with that name already exists in this business.");
    }
    fail(error.message || "Unable to create branch.");
  }

  revalidatePath("/dashboard/branches");
  redirect("/dashboard/branches?message=Branch%20created%20successfully.");
}

export async function updateBranch(formData: FormData) {
  const branchId = value(formData, "branch_id");
  const name = value(formData, "name");
  const address = value(formData, "address");
  const phone = value(formData, "phone");
  const status = value(formData, "status");

  if (!branchId) fail("Missing branch.");
  validateBranchFields(name, address, phone);
  if (!["active", "inactive"].includes(status)) fail("Invalid branch status.");

  const { supabase, businessId } = await ownerAdminContext(branchId);
  const { error } = await supabase
    .from("branches")
    .update({ name, address: address || null, phone: phone || null, status })
    .eq("id", branchId)
    .eq("business_id", businessId);

  if (error) {
    if (error.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
      fail("A branch with that name already exists in this business.");
    }
    fail(error.message || "Unable to update branch.");
  }

  revalidatePath("/dashboard/branches");
  redirect("/dashboard/branches?message=Branch%20updated%20successfully.");
}

export async function deleteBranch(formData: FormData) {
  const branchId = value(formData, "branch_id");
  if (!branchId) fail("Missing branch.");

  const { supabase, businessId } = await ownerAdminContext(branchId);

  const { count: historyCount, error: historyError } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("branch_id", branchId);

  if (historyError) fail(historyError.message || "Unable to check branch history.");
  if ((historyCount ?? 0) > 0) {
    fail("This branch has queue history and cannot be deleted. Set it to inactive instead.");
  }

  const { error } = await supabase
    .from("branches")
    .delete()
    .eq("id", branchId)
    .eq("business_id", businessId);

  if (error) fail(error.message || "Unable to delete branch.");

  revalidatePath("/dashboard/branches");
  redirect("/dashboard/branches?message=Branch%20deleted%20successfully.");
}
