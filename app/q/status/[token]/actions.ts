"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { consumeRateLimit, requestClientIp } from "@/lib/security/rate-limit";
import { isValidSmsRecipient, normalizeSmsRecipient } from "@/lib/notifications/phone";
import { processPendingSmsNotifications } from "@/lib/notifications/sms";

export async function updateSmsNumber(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const dialCode = String(formData.get("country_dial_code") ?? "63").trim();
  if (!token) redirect("/");

  const requestHeaders = await headers();
  const ip = requestClientIp(requestHeaders);
  const smsLimit = await consumeRateLimit({ name: "public_sms_opt_in", limit: 6, windowSeconds: 600 }, `${token}:${ip}`);
  if (!smsLimit.allowed) {
    redirect(`/q/status/${encodeURIComponent(token)}?error=${encodeURIComponent("Too many SMS update attempts. Please wait and try again.")}`);
  }

  const phone = normalizeSmsRecipient(rawPhone, dialCode);
  if (!isValidSmsRecipient(phone)) {
    redirect(`/q/status/${encodeURIComponent(token)}?error=${encodeURIComponent("Enter a valid mobile number and country code.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_stub_sms_number", {
    target_session_token: token,
    target_phone: phone,
  });
  if (error) redirect(`/q/status/${encodeURIComponent(token)}?error=${encodeURIComponent(error.message)}`);

  // The database enqueues an alert immediately when the customer opts in while
  // already inside the notification threshold. Delivery is deliberately
  // backgrounded so an SMS outage never blocks the customer status page.
  after(async () => {
    try {
      await processPendingSmsNotifications();
    } catch (dispatchError) {
      console.error("QueueDrop SMS opt-in dispatch failed", dispatchError);
    }
  });

  revalidatePath(`/q/status/${token}`);
  redirect(`/q/status/${encodeURIComponent(token)}?message=${encodeURIComponent("SMS alerts enabled for this stub.")}`);
}
