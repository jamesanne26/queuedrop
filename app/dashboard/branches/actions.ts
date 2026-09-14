"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function fail(message: string): never {
  redirect(`/dashboard/settings?view=branch-general&error=${encodeURIComponent(message)}`);
}

async function ownerAdminContext(targetBranchId?: string) {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/auth/login?next=%2Fdashboard%2Fsettings");
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
  const sourceBranchId = value(formData, "source_branch_id");
  const duplicateSettings = Boolean(sourceBranchId);
  validateBranchFields(name, address, phone);

  const { supabase, businessId } = await ownerAdminContext();
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

  const { data: createdBranch, error: createdError } = await supabase
    .from("branches")
    .select("id")
    .eq("business_id", businessId)
    .eq("name", name)
    .limit(1)
    .maybeSingle();

  if (createdError || !createdBranch?.id) fail("Branch was created, but QueueDrop could not open it.");

  if (duplicateSettings && sourceBranchId) {
    const { data: sourceBranch } = await supabase
      .from("branches")
      .select("id,timezone,terminal_theme,terminal_page_bg_color,terminal_press_bg_color,terminal_accent_color,terminal_text_color,terminal_muted_text_color,terminal_background_image_url,terminal_logo_url,terminal_background_overlay")
      .eq("id", sourceBranchId)
      .eq("business_id", businessId)
      .maybeSingle();

    if (sourceBranch) {
      const [configResult, hoursResult, rulesResult, servicesResult] = await Promise.all([
        supabase.from("queue_configurations").select("starting_number,no_show_minutes,is_active,show_branch_contact,customer_refresh_seconds,sms_notifications_enabled,sms_start_position").eq("branch_id", sourceBranchId).maybeSingle(),
        supabase.from("operating_hours").select("day_of_week,is_open,open_time,close_time").eq("branch_id", sourceBranchId).order("day_of_week"),
        supabase.from("position_notification_rules").select("position,send_sms_once,browser_notification").eq("branch_id", sourceBranchId).order("position"),
        supabase.from("services").select("name,description,queue_prefix,estimated_minutes,is_active").eq("branch_id", sourceBranchId).order("created_at"),
      ]);

      const branchSettings = { ...sourceBranch };
      delete (branchSettings as { id?: string }).id;
      await supabase.from("branches").update(branchSettings).eq("id", createdBranch.id).eq("business_id", businessId);

      if (configResult.data) {
        await supabase.from("queue_configurations").upsert({ branch_id: createdBranch.id, ...configResult.data }, { onConflict: "branch_id" });
      }

      await supabase.from("operating_hours").delete().eq("branch_id", createdBranch.id);
      if (hoursResult.data?.length) {
        await supabase.from("operating_hours").insert(hoursResult.data.map((row: { day_of_week: number; is_open: boolean; open_time: string | null; close_time: string | null }) => ({ branch_id: createdBranch.id, ...row })));
      }

      await supabase.from("position_notification_rules").delete().eq("branch_id", createdBranch.id);
      if (rulesResult.data?.length) {
        await supabase.from("position_notification_rules").insert(rulesResult.data.map((row: { position: number; send_sms_once: boolean; browser_notification: boolean }) => ({ branch_id: createdBranch.id, ...row })));
      }

      await supabase.from("services").delete().eq("branch_id", createdBranch.id);
      if (servicesResult.data?.length) {
        await supabase.from("services").insert(servicesResult.data.map((row: { name: string; description: string | null; queue_prefix: string | null; estimated_minutes: number | null; is_active: boolean }) => ({ branch_id: createdBranch.id, ...row })));
      }
    }
  }

  revalidatePath("/dashboard/branches");
  revalidatePath("/dashboard/settings");
  redirect(`/dashboard/settings?branch=${createdBranch.id}&view=branch-general&message=${encodeURIComponent(duplicateSettings ? "Branch created and settings duplicated successfully." : "Branch created successfully.")}`);
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
  revalidatePath("/dashboard/settings");
  redirect(`/dashboard/settings?branch=${branchId}&view=branch-general&message=Branch%20updated%20successfully.`);
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
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?view=branch-general&message=Branch%20deleted%20successfully.");
}


export async function updateBranchStatus(formData: FormData) {
  const branchId = value(formData, "branch_id");
  const status = value(formData, "status");

  if (!branchId) fail("Missing branch.");
  if (!["active", "inactive"].includes(status)) fail("Invalid branch status.");

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/login?next=%2Fdashboard%2Fsettings");

  const { error } = await supabase.rpc("set_assigned_branch_status", {
    target_branch_id: branchId,
    target_status: status,
  });

  if (error) fail(error.message || "Unable to update branch status.");

  revalidatePath("/dashboard/branches");
  revalidatePath("/dashboard/settings");
  redirect(`/dashboard/settings?branch=${branchId}&view=branch-general&message=Branch%20status%20updated.`);
}
