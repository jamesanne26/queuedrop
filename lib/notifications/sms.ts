import { createAdminClient } from "@/lib/supabase/admin";

type PendingSms = {
  id: string;
  recipient: string | null;
  message: string;
  payload: Record<string, unknown> | null;
};

function semaphoreConfig() {
  return {
    apiKey: process.env.SEMAPHORE_API_KEY?.trim() ?? "",
    senderName: process.env.SEMAPHORE_SENDER_NAME?.trim() ?? "",
  };
}

async function sendSemaphoreSms(recipient: string, message: string) {
  const { apiKey, senderName } = semaphoreConfig();
  if (!apiKey) {
    return { configured: false as const };
  }

  const body = new URLSearchParams({
    apikey: apiKey,
    number: recipient,
    message,
  });
  if (senderName) body.set("sendername", senderName);

  const response = await fetch("https://api.semaphore.co/api/v4/messages", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const raw = await response.text();
  let providerResponse: unknown = raw;
  try {
    providerResponse = JSON.parse(raw);
  } catch {
    // Keep the raw provider response for diagnostics.
  }

  if (!response.ok) {
    throw new Error(`Semaphore SMS failed (${response.status}): ${raw.slice(0, 300)}`);
  }

  return { configured: true as const, providerResponse };
}

export async function processPendingSmsNotifications(limit = 20) {
  const { apiKey } = semaphoreConfig();
  if (!apiKey) {
    // Leave jobs pending until Semaphore is configured in the deployment.
    return { sent: 0, failed: 0, skipped: true };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notifications")
    .select("id, recipient, message, payload")
    .eq("channel", "sms")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 100)));

  if (error) throw error;

  let sent = 0;
  let failed = 0;

  for (const item of (data ?? []) as PendingSms[]) {
    if (!item.recipient) continue;

    // Claim the row first so concurrent queue actions cannot send it twice.
    const { data: claimed, error: claimError } = await admin
      .from("notifications")
      .update({ status: "processing" })
      .eq("id", item.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (claimError) throw claimError;
    if (!claimed) continue;

    try {
      const result = await sendSemaphoreSms(item.recipient, item.message);
      if (!result.configured) {
        await admin.from("notifications").update({ status: "pending" }).eq("id", item.id);
        continue;
      }

      const payload = {
        ...(item.payload ?? {}),
        sms_provider: "semaphore",
        provider_response: result.providerResponse,
      };

      const { error: updateError } = await admin
        .from("notifications")
        .update({ status: "sent", sent_at: new Date().toISOString(), payload })
        .eq("id", item.id);
      if (updateError) throw updateError;
      sent += 1;
    } catch (sendError) {
      failed += 1;
      const payload = {
        ...(item.payload ?? {}),
        sms_provider: "semaphore",
        provider_error: sendError instanceof Error ? sendError.message : "Unknown SMS error",
      };
      await admin
        .from("notifications")
        .update({ status: "failed", payload })
        .eq("id", item.id);
    }
  }

  return { sent, failed, skipped: false };
}

export async function dispatchSmsAfterQueueChange() {
  try {
    await processPendingSmsNotifications();
  } catch (error) {
    // Queue operations must still succeed even if the external SMS provider is down.
    console.error("QueueDrop SMS dispatch failed", error);
  }
}
