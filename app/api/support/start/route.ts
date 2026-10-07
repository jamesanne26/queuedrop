import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const portalUrl = process.env.SUPPORT_PORTAL_URL;
  if (!portalUrl) return NextResponse.json({ error: "Support is not configured yet." }, { status: 503 });
  let destination: URL;
  try {
    destination = new URL(portalUrl);
    if (destination.protocol !== "https:" || destination.username || destination.password || destination.search || destination.hash) throw new Error("Invalid portal URL");
  } catch {
    return NextResponse.json({ error: "Support configuration is invalid." }, { status: 503 });
  }
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.redirect(new URL("/login", requestUrl.origin));
  const from = requestUrl.searchParams.get("from") || "/dashboard";
  const sourcePage = /^\/dashboard(?:\/[a-zA-Z0-9_-]+)*$/.test(from) && from.length <= 500 ? from : "/dashboard";
  const { data: code, error } = await supabase.rpc("support_start", {
    p_context: { app: "queuedrop", source_page: sourcePage, environment: process.env.VERCEL_ENV || "development" },
  });
  if (error || typeof code !== "string" || !/^[a-f0-9]{64}$/.test(code)) {
    return NextResponse.json({ error: "Unable to open Support. Please try again." }, { status: 403 });
  }
  destination.hash = new URLSearchParams({ code }).toString();
  const response = NextResponse.redirect(destination, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
