"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function saveSmsMethodAction(formData: FormData) {
  const admin = createAdminClient();
  const id = text(formData, "id");
  const payload = {
    name: text(formData, "name"),
    method_type: text(formData, "method_type"),
    provider_code: text(formData, "provider_code") || null,
    country_code: (text(formData, "country_code") || "PH").toUpperCase(),
    is_enabled: formData.get("is_enabled") === "on",
    priority: Number(text(formData, "priority") || 100),
    api_base_url: text(formData, "api_base_url") || null,
    secret_env_key: text(formData, "secret_env_key") || null,
    sender_name: text(formData, "sender_name") || null,
    cost_per_sms: text(formData, "cost_per_sms") ? Number(text(formData, "cost_per_sms")) : null,
    currency: (text(formData, "currency") || "PHP").toUpperCase(),
  };
  if (!payload.name) throw new Error("Delivery method name is required.");
  const result = id
    ? await admin.from("sms_delivery_methods").update(payload).eq("id", id)
    : await admin.from("sms_delivery_methods").insert(payload);
  if (result.error) throw result.error;
  revalidatePath("/system/sms");
}

export async function saveSystemSmsRouteAction(formData: FormData) {
  const admin = createAdminClient();
  const country = (text(formData, "country_code") || "PH").toUpperCase();
  const primary = text(formData, "primary_method_id") || null;
  const fallback = formData.getAll("fallback_method_ids").map(String).filter(Boolean);
  const payload = {
    scope_type: "country",
    country_code: country,
    primary_method_id: primary,
    fallback_method_ids: fallback,
    routing_policy: text(formData, "routing_policy") || "manual_priority",
    retry_limit: Number(text(formData, "retry_limit") || 2),
    failover_after_seconds: Number(text(formData, "failover_after_seconds") || 30),
    is_enabled: true,
  };
  const { data: existing } = await admin.from("sms_routing_rules")
    .select("id").eq("scope_type", "country").eq("country_code", country).limit(1).maybeSingle();
  const result = existing
    ? await admin.from("sms_routing_rules").update(payload).eq("id", existing.id)
    : await admin.from("sms_routing_rules").insert(payload);
  if (result.error) throw result.error;
  revalidatePath("/system/sms");
}
