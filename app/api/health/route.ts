import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { probeReadiness } from "@/lib/operations/health";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const liveness = request.nextUrl.searchParams.get("liveness") === "1";
  const readiness = liveness ? { status: "ok", database: "not_checked" } : await probeReadiness(() =>
    createAdminClient().from("businesses").select("id").limit(1).abortSignal(AbortSignal.timeout(5000)),
  );
  return NextResponse.json(
    {
      ...readiness,
      ...(request.nextUrl.hostname === "queuedrop-test.jamesrae-rosario18.workers.dev" && readiness.status !== "ok"
        ? { diagnostics: {
            supabaseUrlConfigured: Boolean(process.env["NEXT_PUBLIC_SUPABASE_URL"]),
            supabasePublishableKeyConfigured: Boolean(process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]),
            supabaseServiceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY),
          } }
        : {}),
      service: "queuedrop-web",
      environment: process.env.VERCEL_ENV ?? process.env["NEXT_PUBLIC_APP_ENV"] ?? "development",
      revision: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
      timestamp: new Date().toISOString(),
    },
    { status: readiness.status === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
