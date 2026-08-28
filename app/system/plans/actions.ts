"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSystemOwner } from "@/lib/auth/system-owner";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function nullableInt(formData: FormData, key: string) {
  const raw = text(formData, key);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${key} must be a whole number.`);
  return value;
}

function nullableMoney(formData: FormData, key: string) {
  const raw = text(formData, key);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${key} must be zero or higher.`);
  return Math.round(value * 100) / 100;
}

function plansUrl(kind: "message" | "error", value: string) {
  return `/system/plans?${kind}=${encodeURIComponent(value)}`;
}

export async function savePlan(formData: FormData) {
  const actor = await requireSystemOwner();
  const admin = createAdminClient();
  const id = text(formData, "plan_id");
  const name = text(formData, "name");
  const description = text(formData, "description");
  const currency = (text(formData, "currency") || "PHP").toUpperCase();
  const applyExisting = formData.get("apply_existing_price") === "on";

  try {
    if (name.length < 2 || name.length > 80) throw new Error("Plan name must be 2-80 characters.");
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be a 3-letter code such as PHP.");

    const priceMonthly = nullableMoney(formData, "price_monthly") ?? 0;
    const priceYearly = nullableMoney(formData, "price_yearly");
    const minBranches = nullableInt(formData, "min_branches") ?? 1;
    const maxBranches = nullableInt(formData, "max_branches");
    const maxActiveQueues = nullableInt(formData, "max_active_queues_per_branch");
    const maxServices = nullableInt(formData, "max_services_per_branch");
    const trialDays = nullableInt(formData, "trial_days") ?? 14;
    const sortOrder = nullableInt(formData, "sort_order") ?? 0;
    if (maxBranches !== null && maxBranches < minBranches) throw new Error("Maximum branches cannot be lower than minimum branches.");

    const payload = {
      name,
      description: description || null,
      currency,
      price_monthly: priceMonthly,
      price_yearly: priceYearly,
      min_branches: minBranches,
      max_branches: maxBranches,
      max_active_queues_per_branch: maxActiveQueues,
      max_services_per_branch: maxServices,
      trial_days: trialDays,
      sort_order: sortOrder,
      is_active: formData.get("is_active") === "on",
      is_public: formData.get("is_public") === "on",
      accepts_new_subscriptions: formData.get("accepts_new_subscriptions") === "on",
      updated_at: new Date().toISOString(),
    };

    let planId = id;
    if (id) {
      const { error } = await admin.from("plans").update(payload).eq("id", id);
      if (error) throw error;
    } else {
      const { data, error } = await admin.from("plans").insert(payload).select("id").single();
      if (error || !data) throw error ?? new Error("Unable to create plan.");
      planId = data.id;
    }

    if (applyExisting && planId) {
      const { error } = await admin
        .from("business_subscriptions")
        .update({ billing_price_monthly: priceMonthly, billing_currency: currency, updated_at: new Date().toISOString() })
        .eq("plan_id", planId)
        .in("status", ["active", "trialing"]);
      if (error) throw error;
    }

    if (planId) {
      await admin.from("system_audit_logs").insert({
        actor_user_id: actor.id, action: id ? "plan.updated" : "plan.created", entity_type: "plan", entity_id: planId,
        details: { name, price_monthly: priceMonthly, currency, max_branches: maxBranches, max_active_queues_per_branch: maxActiveQueues, max_services_per_branch: maxServices, apply_existing_price: applyExisting },
      });
    }
  } catch (error) {
    redirect(plansUrl("error", error instanceof Error ? error.message : "Unable to save plan."));
  }

  revalidatePath("/system");
  revalidatePath("/system/plans");
  revalidatePath("/pricing");
  revalidatePath("/client/subscription");
  redirect(plansUrl("message", id ? "Plan updated." : "Plan created."));
}
