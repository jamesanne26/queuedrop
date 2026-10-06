import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processPendingSmsNotifications } from "@/lib/notifications/sms";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { error: cleanupError } = await admin.from("stub_requests").delete().lt("created_at", new Date(Date.now() - 7 * 86400_000).toISOString());
  if (cleanupError) return NextResponse.json({ error: "Request retention cleanup failed" }, { status: 503 });
  const outcomes: Record<string, unknown> = {};
  let failed = false;
  for (const [name, work] of [
    ["end_of_day", async () => {
      const { data, error } = await admin.rpc("finalize_closed_branch_tickets");
      if (error) throw error;
      return data;
    }],
    ["sms", async () => processPendingSmsNotifications(20)],
  ] as const) {
    const { error: startError } = await admin.from("worker_runs").upsert({
      name, last_started_at: new Date().toISOString(), last_error: null,
    }, { onConflict: "name" });
    try {
      if (startError) throw startError;
      outcomes[name] = await work();
      const { error } = await admin.from("worker_runs").update({
        last_succeeded_at: new Date().toISOString(), last_error: null,
      }).eq("name", name);
      if (error) throw error;
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : "Worker failed";
      console.error(JSON.stringify({ event: "worker_failed", worker: name, message }));
      await admin.from("worker_runs").update({ last_error: message.slice(0, 500) }).eq("name", name);
      outcomes[name] = { error: "Worker failed" };
    }
  }
  return NextResponse.json({ ok: !failed, outcomes }, { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
