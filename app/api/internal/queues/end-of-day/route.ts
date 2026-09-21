import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { data, error } = await createAdminClient().rpc("finalize_closed_branch_tickets");
  if (error) {
    console.error(JSON.stringify({ event: "queue_end_of_day_failed", message: error.message }));
    return NextResponse.json({ error: "End-of-day queue finalization failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ ok: true, tickets_marked_not_completed: Number(data ?? 0) }, { headers: { "Cache-Control": "no-store" } });
}
