import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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
  return NextResponse.json({ ok: true, reconciled: Number(data ?? 0) }, { headers: { "Cache-Control": "no-store" } });
}
