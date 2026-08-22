import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "queuedrop-web",
    environment: process.env.VERCEL_ENV ?? "development",
  });
}
