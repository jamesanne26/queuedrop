import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceDeviceRateLimits } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ deviceToken: string }> }) {
  const { deviceToken } = await params;
  const limit = await enforceDeviceRateLimits(request.headers, deviceToken, "browser_queue_ticket", 20, 120);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many queue requests. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter), "Cache-Control": "no-store" } },
    );
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_browser_queue_ticket", { target_device_token: deviceToken });
  if (error || !data) return NextResponse.json({ error: error?.message || "Unable to join queue." }, { status: 400 });
  const ticket = data as { session_token: string };
  return NextResponse.json(
    { ...ticket, status_url: `${request.nextUrl.origin}/q/status/${ticket.session_token}` },
    { headers: { "Cache-Control": "no-store" } },
  );
}
