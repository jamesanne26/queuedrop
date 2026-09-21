"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSystemOwner } from "@/lib/auth/system-owner";
import { processPendingSmsNotifications } from "@/lib/notifications/sms";
import { assertSafeSmsProviderUrl, isSafeProviderField, smsProviderCredentialEnvKey } from "@/lib/notifications/sms-provider-config";
import { validateRouteMethodSelection } from "@/lib/notifications/sms-routing";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parseObjectField(formData: FormData, key: string) {
  const raw = text(formData, key);
  if (!raw) return {} as Record<string, string>;
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${key} must be a JSON object.`);
  const result: Record<string, string> = {};
  for (const [entryKey, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isSafeProviderField(entryKey)) throw new Error(`${key} contains an invalid field name.`);
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new Error(`${key} values must be strings, numbers, or booleans.`);
    }
    result[entryKey] = String(value);
  }
  return result;
}

function cloudConfig(formData: FormData) {
  const httpMethod = text(formData, "http_method") === "GET" ? "GET" : "POST";
  const bodyFormat = text(formData, "body_format") === "json" ? "json" : "form";
  const apiKeyLocation = ["body", "header", "query", "bearer", "basic"].includes(text(formData, "api_key_location"))
    ? text(formData, "api_key_location")
    : "body";
  const config = {
    transport: "generic_http",
    http_method: httpMethod,
    body_format: bodyFormat,
    api_key_location: apiKeyLocation,
    api_key_field: text(formData, "api_key_field") || "apikey",
    api_key_prefix: text(formData, "api_key_prefix"),
    api_key_username: text(formData, "api_key_username"),
    recipient_field: text(formData, "recipient_field") || "number",
    message_field: text(formData, "message_field") || "message",
    sender_field: text(formData, "sender_field") || "sendername",
    response_message_id_path: text(formData, "response_message_id_path"),
    static_params: parseObjectField(formData, "static_params"),
    headers: parseObjectField(formData, "headers"),
  };
  for (const [label, value] of [
    ["API key", config.api_key_field],
    ["recipient", config.recipient_field],
    ["message", config.message_field],
    ["sender", config.sender_field],
  ] as const) {
    if (!isSafeProviderField(value)) throw new Error(`${label} field name is invalid.`);
  }
  return config;
}

export async function saveSmsMethodAction(formData: FormData) {
  await requireSystemOwner();
  const admin = createAdminClient();
  const id = text(formData, "id");
  const methodType = text(formData, "method_type") || "cloud_provider";
  const apiBaseUrl = text(formData, "api_base_url") || null;
  if (methodType === "cloud_provider") {
    if (!apiBaseUrl) throw new Error("Cloud provider API URL is required.");
    assertSafeSmsProviderUrl(apiBaseUrl);
  }
  const providerCode = text(formData, "provider_code") || null;
  let secretEnvKey: string | null = null;
  if (methodType === "cloud_provider") {
    if (!providerCode) throw new Error("Cloud provider code is required.");
    if (id) {
      const { data: existing, error: existingError } = await admin
        .from("sms_delivery_methods")
        .select("secret_env_key")
        .eq("id", id)
        .maybeSingle();
      if (existingError) throw existingError;
      secretEnvKey = existing?.secret_env_key?.trim() || smsProviderCredentialEnvKey(providerCode);
    } else {
      secretEnvKey = smsProviderCredentialEnvKey(providerCode);
    }
  }
  const payload = {
    name: text(formData, "name"),
    method_type: methodType,
    provider_code: providerCode,
    country_code: (text(formData, "country_code") || "PH").toUpperCase(),
    is_enabled: formData.get("is_enabled") === "on",
    priority: Number(text(formData, "priority") || 100),
    api_base_url: apiBaseUrl,
    secret_env_key: secretEnvKey,
    sender_name: text(formData, "sender_name") || null,
    cost_per_sms: text(formData, "cost_per_sms") ? Number(text(formData, "cost_per_sms")) : null,
    currency: (text(formData, "currency") || "PHP").toUpperCase(),
    config: methodType === "cloud_provider" ? cloudConfig(formData) : {},
  };
  if (!payload.name) throw new Error("Delivery method name is required.");
  if (!Number.isFinite(payload.priority) || payload.priority < 1) throw new Error("Priority must be at least 1.");
  if (payload.cost_per_sms !== null && (!Number.isFinite(payload.cost_per_sms) || payload.cost_per_sms < 0)) throw new Error("Cost per SMS is invalid.");
  const result = id
    ? await admin.from("sms_delivery_methods").update(payload).eq("id", id)
    : await admin.from("sms_delivery_methods").insert(payload);
  if (result.error) throw result.error;
  revalidatePath("/system/sms");
}

export async function saveSystemSmsRouteAction(formData: FormData) {
  await requireSystemOwner();
  const admin = createAdminClient();
  const country = (text(formData, "country_code") || "PH").toUpperCase();
  const primary = text(formData, "primary_method_id");
  const requestedFallback = formData.getAll("fallback_method_ids").map(String).filter(Boolean);
  const { data: routeMethods, error: routeMethodsError } = await admin
    .from("sms_delivery_methods")
    .select("id,name,method_type,country_code,is_enabled,priority,cost_per_sms")
    .eq("country_code", country);
  if (routeMethodsError) throw routeMethodsError;
  const validated = validateRouteMethodSelection({
    countryCode: country,
    primaryMethodId: primary,
    fallbackMethodIds: requestedFallback,
    methods: routeMethods ?? [],
  });
  const payload = {
    scope_type: "country",
    country_code: country,
    primary_method_id: validated.primary.id,
    fallback_method_ids: validated.fallbackMethodIds,
    routing_policy: text(formData, "routing_policy") || "manual_priority",
    retry_limit: Number(text(formData, "retry_limit") || 2),
    failover_after_seconds: Number(text(formData, "failover_after_seconds") || 30),
    is_enabled: true,
  };
  const { data: existing } = await admin.from("sms_routing_rules")
    .select("id").eq("scope_type", "country").eq("country_code", country).limit(1).maybeSingle();
  const result = existing
    ? await admin.from("sms_routing_rules").update(payload).eq("id", existing.id).select("id,primary_method_id,fallback_method_ids,routing_policy").single()
    : await admin.from("sms_routing_rules").insert(payload).select("id,primary_method_id,fallback_method_ids,routing_policy").single();
  if (result.error) throw result.error;
  if (result.data.primary_method_id !== validated.primary.id) {
    throw new Error("SMS route was not persisted correctly. No routing change was accepted.");
  }
  revalidatePath("/system/sms");
}

export async function dispatchPendingSmsAction() {
  await requireSystemOwner();
  await processPendingSmsNotifications(100);
  revalidatePath("/system/sms");
}

export async function retryFailedSmsAction() {
  await requireSystemOwner();
  const admin = createAdminClient();
  const { error } = await admin.from("notifications").update({
    status: "pending",
    next_attempt_at: null,
    processing_started_at: null,
    last_error: null,
  }).eq("channel", "sms").eq("status", "failed");
  if (error) throw error;
  await processPendingSmsNotifications(100);
  revalidatePath("/system/sms");
}
