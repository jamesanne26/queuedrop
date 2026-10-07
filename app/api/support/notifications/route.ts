import { NextResponse } from "next/server";
import { dispatchNotifications } from "@/lib/support/notification-delivery";

export const maxDuration = 60;
export async function POST(request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ error: "Owner session required" }, { status: 403 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ error: "Support database is not configured" }, { status: 503 });
  const rpc = async (action: string, data: Record<string, unknown> = {}) => {
    const response = await fetch(`${url}/rest/v1/rpc/support_call`, {
      method: "POST", headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ p_session: token, p_action: action, p_data: data }), signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error("Support operation denied");
    return result;
  };
  try {
    // This validates active system-owner membership before any provider call.
    const context = await rpc("context");
    if (!context.owner) return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    const production = process.env.VERCEL_ENV === "production";
    const result = await dispatchNotifications(rpc, {
      dryRun: !production || process.env.SUPPORT_NOTIFICATION_DRY_RUN === "true",
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.QUEUEDROP_SUPPORT_EMAIL,
      appUrl: production ? "https://getqueuedrop.com" : "https://queuedrop-test.vercel.app",
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to dispatch support notifications. Check configuration or owner session." }, { status: 503 });
  }
}
