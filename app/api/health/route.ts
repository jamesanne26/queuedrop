import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "queuedrop-web",
      environment: process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_APP_ENV ?? "development",
      revision: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
