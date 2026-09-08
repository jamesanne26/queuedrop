import { NextRequest, NextResponse } from "next/server";
import { processPendingSmsNotifications } from "@/lib/notifications/sms";

export const dynamic = "force-dynamic";

async function handle(request: NextRequest) {
  const expected = process.env.SMS_DISPATCH_SECRET?.trim() ?? "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!expected || !supplied || supplied !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processPendingSmsNotifications(100);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("QueueDrop SMS dispatcher endpoint failed", error);
    return NextResponse.json({ ok: false, error: "SMS dispatch failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}
