import { createAdminClient } from "@/lib/supabase/admin";
import {
  isValidSmsRecipient,
  normalizeSmsRecipient,
  smsCountryFromRecipient,
} from "@/lib/notifications/phone";
import {
  buildGenericSmsRequest,
  readPath,
  semaphoreHttpConfig,
  type SmsHttpProviderConfig,
} from "@/lib/notifications/sms-provider-config";
import { orderSmsMethodsForRule } from "@/lib/notifications/sms-routing";
import { shouldForceSmsFailure } from "@/lib/notifications/sms-test-policy";

type PendingSms = {
  id: string;
  business_id: string;
  branch_id: string | null;
  recipient: string | null;
  message: string;
  payload: Record<string, unknown> | null;
  attempt_count: number | null;
};

type SmsDeliveryMethod = {
  id: string;
  name: string;
  method_type: "cloud_provider" | "system_android" | "branch_android";
  provider_code: string | null;
  country_code: string;
  is_enabled: boolean;
  priority: number;
  api_base_url: string | null;
  secret_env_key: string | null;
  sender_name: string | null;
  cost_per_sms: number | null;
  currency: string | null;
  config: Record<string, unknown> | null;
};

type SmsRoutingRule = {
  id: string;
  scope_type: "system" | "country" | "business" | "branch";
  country_code: string | null;
  business_id: string | null;
  branch_id: string | null;
  primary_method_id: string | null;
  fallback_method_ids: string[] | null;
  routing_policy: string;
  retry_limit: number;
  failover_after_seconds: number;
  is_enabled: boolean;
};

type ProviderSendResult = {
  provider: string;
  providerMessageId: string | null;
  providerResponse: unknown;
  simulated: boolean;
};

export function envFlag(name: string) {
  return ["1", "true", "yes", "on"].includes((process.env[name] ?? "").trim().toLowerCase());
}

export function smsRuntimeConfig() {
  return {
    dryRun: envFlag("SMS_DRY_RUN"),
    semaphoreConfigured: Boolean(process.env.SEMAPHORE_API_KEY?.trim()),
    dispatcherSecretConfigured: Boolean(process.env.SMS_DISPATCH_SECRET?.trim()),
  };
}

function configuredSecret(method: SmsDeliveryMethod) {
  const key = method.secret_env_key?.trim();
  if (!key) return "";
  return process.env[key]?.trim() ?? "";
}

function providerMessageIdFromResponse(value: unknown, preferredPath?: string | null) {
  const preferred = readPath(value, preferredPath);
  if (preferred) return preferred;
  const first = Array.isArray(value) ? value[0] : value;
  if (!first || typeof first !== "object") return null;
  const record = first as Record<string, unknown>;
  for (const key of ["message_id", "messageId", "id"]) {
    const candidate = record[key];
    if (typeof candidate === "string" || typeof candidate === "number") return String(candidate);
  }
  return null;
}

function methodHttpConfig(method: SmsDeliveryMethod): SmsHttpProviderConfig | null {
  const raw = method.config ?? {};
  if (raw.transport === "generic_http") return raw as SmsHttpProviderConfig;
  if ((method.provider_code ?? "").toLowerCase() === "semaphore") return semaphoreHttpConfig();
  return null;
}

async function sendGenericHttpSms(
  method: SmsDeliveryMethod,
  recipient: string,
  message: string,
  timeoutSeconds: number,
): Promise<ProviderSendResult> {
  const config = methodHttpConfig(method);
  if (!config) throw new Error(`${method.name} does not have a Generic HTTP adapter configured.`);

  const normalizedRecipient = normalizeSmsRecipient(recipient);
  if (!isValidSmsRecipient(normalizedRecipient)) throw new Error("Recipient is not a valid international SMS number.");

  if (shouldForceSmsFailure()) {
    throw new Error("Forced SMS provider failure for TEST retry verification.");
  }

  if (envFlag("SMS_DRY_RUN")) {
    return {
      provider: method.provider_code || method.name,
      providerMessageId: `dry-run-${Date.now()}`,
      providerResponse: { simulated: true, recipient: normalizedRecipient, method: method.name },
      simulated: true,
    };
  }

  const apiKey = configuredSecret(method);
  if (!apiKey) throw new Error(`SMS secret ${method.secret_env_key || "(not configured)"} is not configured.`);
  const apiBaseUrl = method.api_base_url?.trim() ?? "";
  if (!apiBaseUrl) throw new Error(`${method.name} API base URL is not configured.`);

  const request = buildGenericSmsRequest({
    apiBaseUrl,
    apiKey,
    senderName: method.sender_name,
    recipient: normalizedRecipient,
    message,
    config,
  });

  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    cache: "no-store",
    signal: AbortSignal.timeout(Math.max(5, Math.min(timeoutSeconds, 600)) * 1000),
  });

  const raw = await response.text();
  let providerResponse: unknown = raw;
  try { providerResponse = JSON.parse(raw); } catch { /* retain raw provider response */ }

  if (!response.ok) {
    throw new Error(`${method.name} SMS failed (${response.status}): ${raw.slice(0, 300)}`);
  }

  return {
    provider: method.provider_code || method.name,
    providerMessageId: providerMessageIdFromResponse(providerResponse, config.response_message_id_path),
    providerResponse,
    simulated: false,
  };
}

async function sendWithMethod(method: SmsDeliveryMethod, recipient: string, message: string, timeoutSeconds: number) {
  if (method.method_type !== "cloud_provider") {
    throw new Error(`${method.name} requires an Android SMS gateway and cannot be sent by the web dispatcher.`);
  }

  const config = methodHttpConfig(method);
  if (config) return sendGenericHttpSms(method, recipient, message, timeoutSeconds);
  throw new Error(`Unsupported SMS provider: ${method.provider_code || method.name}. Configure its Generic HTTP adapter in System > SMS.`);
}

async function resolveRoute(
  admin: ReturnType<typeof createAdminClient>,
  item: PendingSms,
  countryCode: string,
) {
  const { data: rules, error: rulesError } = await admin
    .from("sms_routing_rules")
    .select("id,scope_type,country_code,business_id,branch_id,primary_method_id,fallback_method_ids,routing_policy,retry_limit,failover_after_seconds,is_enabled")
    .eq("is_enabled", true);
  if (rulesError) throw rulesError;

  const list = (rules ?? []) as SmsRoutingRule[];
  const rule =
    (item.branch_id ? list.find((candidate) => candidate.scope_type === "branch" && candidate.branch_id === item.branch_id) : undefined) ??
    list.find((candidate) => candidate.scope_type === "business" && candidate.business_id === item.business_id) ??
    list.find((candidate) => candidate.scope_type === "country" && candidate.country_code === countryCode) ??
    list.find((candidate) => candidate.scope_type === "system") ??
    null;

  const { data: methods, error: methodsError } = await admin
    .from("sms_delivery_methods")
    .select("id,name,method_type,provider_code,country_code,is_enabled,priority,api_base_url,secret_env_key,sender_name,cost_per_sms,currency,config")
    .eq("is_enabled", true)
    .eq("country_code", countryCode)
    .order("priority", { ascending: true });
  if (methodsError) throw methodsError;

  const available = (methods ?? []) as SmsDeliveryMethod[];
  if (!rule) return { rule: null, methods: available, retryLimit: 2 };

  const ordered = orderSmsMethodsForRule(rule, available);
  if (ordered.length === 0) {
    throw new Error("SMS routing rule has no valid configured delivery method. Select a primary provider in System > SMS.");
  }

  return { rule, methods: ordered as SmsDeliveryMethod[], retryLimit: Math.max(0, Math.min(rule.retry_limit ?? 2, 10)) };
}

export function retryDelaySeconds(attemptNumber: number) {
  return Math.min(15 * 60, 30 * 2 ** Math.max(0, attemptNumber - 1));
}

async function createAttempt(
  admin: ReturnType<typeof createAdminClient>,
  item: PendingSms,
  method: SmsDeliveryMethod,
  attemptNumber: number,
) {
  const { data, error } = await admin
    .from("sms_delivery_attempts")
    .insert({
      notification_id: item.id,
      method_id: method.id,
      gateway_device_id: null,
      attempt_number: attemptNumber,
      status: "sending",
      estimated_cost: method.cost_per_sms,
      currency: method.currency,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function processPendingSmsNotifications(limit = 20) {
  const admin = createAdminClient();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 5 * 60_000).toISOString();

  // Recover jobs abandoned by a terminated request/worker.
  await admin
    .from("notifications")
    .update({ status: "pending", processing_started_at: null })
    .eq("channel", "sms")
    .eq("status", "processing")
    .or(`processing_started_at.is.null,processing_started_at.lt.${staleBefore}`);

  const { data, error } = await admin
    .from("notifications")
    .select("id,business_id,branch_id,recipient,message,payload,attempt_count")
    .eq("channel", "sms")
    .eq("status", "pending")
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now.toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 100)));
  if (error) throw error;

  let sent = 0;
  let failed = 0;
  let retried = 0;
  let claimedCount = 0;

  for (const item of (data ?? []) as PendingSms[]) {
    if (!item.recipient) continue;

    const normalizedRecipient = normalizeSmsRecipient(item.recipient);
    if (!isValidSmsRecipient(normalizedRecipient)) {
      await admin.from("notifications").update({ status: "failed", last_error: "Invalid SMS recipient." }).eq("id", item.id);
      failed += 1;
      continue;
    }

    const attemptNumber = Math.max(1, Number(item.attempt_count ?? 0) + 1);
    const { data: claimed, error: claimError } = await admin
      .from("notifications")
      .update({ status: "processing", processing_started_at: new Date().toISOString(), attempt_count: attemptNumber, last_error: null })
      .eq("id", item.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) continue;
    claimedCount += 1;

    const countryCode = smsCountryFromRecipient(normalizedRecipient);
    let lastError = "No SMS delivery method is available.";

    try {
      const route = await resolveRoute(admin, item, countryCode);
      if (route.methods.length === 0) throw new Error(`No enabled SMS delivery method is configured for ${countryCode}.`);

      let delivered = false;
      for (const method of route.methods) {
        let attemptId: string | null = null;
        try {
          attemptId = await createAttempt(admin, item, method, attemptNumber);
          const result = await sendWithMethod(method, normalizedRecipient, item.message, route.rule?.failover_after_seconds ?? 30);
          const payload = {
            ...(item.payload ?? {}),
            sms_provider: result.provider,
            sms_simulated: result.simulated,
            provider_response: result.providerResponse,
          };

          const finishedAt = new Date().toISOString();
          await admin.from("sms_delivery_attempts").update({
            status: "sent",
            provider_message_id: result.providerMessageId,
            finished_at: finishedAt,
          }).eq("id", attemptId);

          const { error: updateError } = await admin.from("notifications").update({
            status: "sent",
            recipient: normalizedRecipient,
            sent_at: finishedAt,
            next_attempt_at: null,
            processing_started_at: null,
            last_error: null,
            provider_message_id: result.providerMessageId,
            payload,
          }).eq("id", item.id);
          if (updateError) throw updateError;
          sent += 1;
          delivered = true;
          break;
        } catch (methodError) {
          lastError = methodError instanceof Error ? methodError.message : "Unknown SMS delivery error";
          if (attemptId) {
            await admin.from("sms_delivery_attempts").update({
              status: "failed",
              error_message: lastError.slice(0, 1000),
              finished_at: new Date().toISOString(),
            }).eq("id", attemptId);
          }
        }
      }

      if (delivered) continue;

      if (attemptNumber <= route.retryLimit) {
        const nextAttempt = new Date(Date.now() + retryDelaySeconds(attemptNumber) * 1000).toISOString();
        await admin.from("notifications").update({
          status: "pending",
          next_attempt_at: nextAttempt,
          processing_started_at: null,
          last_error: lastError.slice(0, 1000),
        }).eq("id", item.id);
        retried += 1;
      } else {
        await admin.from("notifications").update({
          status: "failed",
          next_attempt_at: null,
          processing_started_at: null,
          last_error: lastError.slice(0, 1000),
        }).eq("id", item.id);
        failed += 1;
      }
    } catch (sendError) {
      lastError = sendError instanceof Error ? sendError.message : "Unknown SMS delivery error";
      await admin.from("notifications").update({
        status: "failed",
        processing_started_at: null,
        last_error: lastError.slice(0, 1000),
      }).eq("id", item.id);
      failed += 1;
    }
  }

  return { sent, failed, retried, claimed: claimedCount, skipped: false };
}

export async function dispatchSmsAfterQueueChange(branchId?: string) {
  try {
    if (branchId) {
      const admin = createAdminClient();
      const { error } = await admin.rpc("enqueue_branch_position_notifications", {
        target_branch_id: branchId,
      });
      if (error) throw error;
    }

    await processPendingSmsNotifications();
  } catch (error) {
    // Queue operations must still succeed even when SMS delivery is unavailable.
    console.error("QueueDrop SMS dispatch failed", error);
  }
}
