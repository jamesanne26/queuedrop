"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSystemOwner } from "@/lib/auth/system-owner";

function text(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }
function num(raw: string, integer = false) {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) throw new Error("Invalid override value.");
  return value;
}

export async function saveClientOverrides(formData: FormData) {
  const actor = await requireSystemOwner();
  const admin = createAdminClient();
  const businessId = text(formData, "business_id");
  const planId = text(formData, "plan_id");
  if (!businessId || !planId) redirect("/system?error=Missing%20client%20or%20plan.");

  try {
    const customPrice = num(text(formData, "custom_monthly_price"));
    const customBranches = num(text(formData, "custom_max_branches"), true);
    const customQueues = num(text(formData, "custom_max_active_queues_per_branch"), true);
    const customServices = num(text(formData, "custom_max_services_per_branch"), true);
    const customTrial = num(text(formData, "custom_trial_days"), true);
    const reason = text(formData, "override_reason");
    const expiresRaw = text(formData, "override_expires_at");
    const overrideExpiresAt = expiresRaw ? new Date(`${expiresRaw}T23:59:59`).toISOString() : null;

    const { data: plan, error: planError } = await admin.from("plans").select("id,price_monthly,currency").eq("id", planId).maybeSingle();
    if (planError || !plan) throw planError ?? new Error("Plan not found.");

    const { data: existing } = await admin.from("business_subscriptions").select("id,plan_id,billing_price_monthly").eq("business_id", businessId).maybeSingle();
    const payload = {
      business_id: businessId,
      plan_id: planId,
      status: "active",
      billing_price_monthly: existing?.plan_id === planId && existing.billing_price_monthly !== null ? existing.billing_price_monthly : plan.price_monthly,
      billing_currency: plan.currency,
      custom_monthly_price: customPrice,
      custom_max_branches: customBranches,
      custom_max_active_queues_per_branch: customQueues,
      custom_max_services_per_branch: customServices,
      custom_trial_days: customTrial,
      override_reason: reason || null,
      override_expires_at: overrideExpiresAt,
      updated_at: new Date().toISOString(),
    };
    const { error } = await admin.from("business_subscriptions").upsert(payload, { onConflict: "business_id" });
    if (error) throw error;
    await admin.from("system_audit_logs").insert({
      actor_user_id: actor.id, action: "client.subscription_override.updated", entity_type: "business", entity_id: businessId,
      details: { plan_id: planId, custom_monthly_price: customPrice, custom_max_branches: customBranches, custom_max_active_queues_per_branch: customQueues, custom_max_services_per_branch: customServices, custom_trial_days: customTrial, override_reason: reason || null, override_expires_at: overrideExpiresAt },
    });
  } catch (error) {
    redirect(`/system/clients/${businessId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to save client overrides.")}`);
  }

  revalidatePath("/system");
  revalidatePath(`/system/clients/${businessId}`);
  revalidatePath("/client/subscription");
  redirect(`/system/clients/${businessId}?message=${encodeURIComponent("Client subscription settings updated.")}`);
}

export async function saveCustomerMoveDownVisibility(formData: FormData) {
  const actor = await requireSystemOwner();
  const admin = createAdminClient();
  const businessId = text(formData, "business_id");
  const branchId = text(formData, "branch_id");
  const enabled = formData.get("customer_can_move_down") === "on";

  if (!businessId || !branchId) {
    redirect("/system?error=Missing%20client%20or%20branch.");
  }

  try {
    const { data: branch, error: branchError } = await admin
      .from("branches")
      .select("id,business_id,name")
      .eq("id", branchId)
      .eq("business_id", businessId)
      .maybeSingle();

    if (branchError || !branch) throw branchError ?? new Error("Branch not found for this client.");

    const { error } = await admin
      .from("queue_configurations")
      .upsert({ branch_id: branchId, customer_can_move_down: enabled, updated_at: new Date().toISOString() }, { onConflict: "branch_id" });
    if (error) throw error;

    await admin.from("system_audit_logs").insert({
      actor_user_id: actor.id,
      action: "client.customer_move_down_visibility.updated",
      entity_type: "branch",
      entity_id: branchId,
      details: { business_id: businessId, branch_name: branch.name, customer_can_move_down: enabled },
    });
  } catch (error) {
    redirect(`/system/clients/${businessId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to update customer move-down visibility.")}`);
  }

  revalidatePath(`/system/clients/${businessId}`);
  revalidatePath("/dashboard/settings");
  redirect(`/system/clients/${businessId}?message=${encodeURIComponent("Customer move-down visibility updated.")}`);
}
