import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceDeviceRateLimits } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ deviceToken: string }> }) {
  const { deviceToken } = await params;
  const body = await request.json().catch(() => ({}));
  const pin = String(body?.pin ?? "").trim();
  if (!/^\d{4,8}$/.test(pin)) return NextResponse.json({ error: "Enter your 4 to 8 digit PIN." }, { status: 400 });

  const limit = await enforceDeviceRateLimits(request.headers, deviceToken, "kiosk_exit_pin", 5, 20);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many PIN attempts. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter), "Cache-Control": "no-store" } },
    );
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Dashboard session expired. Sign in again." }, { status: 401 });

  const { data, error } = await supabase.rpc("verify_kiosk_exit_pin", {
    target_device_token: deviceToken,
    target_pin: pin,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Incorrect PIN." }, { status: 403 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
