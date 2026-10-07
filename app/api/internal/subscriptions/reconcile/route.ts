import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchNotifications } from "@/lib/support/notification-delivery";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return unauthorized();

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reconcile_subscription_lifecycle");
  if (error) {
    console.error(JSON.stringify({ event: "subscription_reconcile_failed", message: error.message }));
    return NextResponse.json({ error: "Subscription reconciliation failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  // Reuse the existing daily scheduler: no extra cron job or AI monitoring.
  let supportDelivery: unknown = { state: "not_attempted" };
  try {
    const production = process.env.VERCEL_ENV === "production";
    supportDelivery = await dispatchNotifications(async (action, payload = {}) => {
      const result = await admin.rpc("support_delivery_worker", { p_action: action, p_data: payload });
      if (result.error) throw new Error("Support delivery operation failed");
      return result.data;
    }, { dryRun: !production || process.env.SUPPORT_NOTIFICATION_DRY_RUN === "true", apiKey: process.env.RESEND_API_KEY,
      from: process.env.SUPPORT_NOTIFICATION_FROM, replyTo: process.env.QUEUEDROP_SUPPORT_EMAIL, appUrl: production ? "https://getqueuedrop.com" : "https://queuedrop-test.vercel.app", batchLimit: 10 });
  } catch {
    supportDelivery = { state: "retry_pending" };
    console.error(JSON.stringify({ event: "support_delivery_retry_pending" }));
  }
  return NextResponse.json({ ok: true, reconciled: Number(data ?? 0), supportDelivery }, { headers: { "Cache-Control": "no-store" } });
}
