import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ deviceToken: string }> }) {
  const { deviceToken } = await params;
  const supabase = await createClient();
  if (request.nextUrl.searchParams.has("jobId")) {
    const jobId = request.nextUrl.searchParams.get("jobId") ?? "";
    const generation = Number(request.nextUrl.searchParams.get("generation"));
    const attempt = Number(request.nextUrl.searchParams.get("attempt"));
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId) ||
        !Number.isSafeInteger(generation) || generation < 0 || !Number.isSafeInteger(attempt) || attempt < 1)
      return NextResponse.json({ allowed: false }, { status: 400 });
    const { data, error } = await supabase.rpc("print_job_retry_allowed", {
      target_device_token: deviceToken, target_job_id: jobId, target_generation: generation, target_attempt: attempt,
    });
    if (error) return NextResponse.json({ allowed: false }, { status: 503 });
    return NextResponse.json({ allowed: data === true }, { headers: { "Cache-Control": "no-store" } });
  }
  const { data, error } = await supabase.rpc("claim_next_print_job", { target_device_token: deviceToken });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ job: null });
  const job = data as { payload?: Record<string, unknown> };
  const sessionToken = String(job.payload?.sessionToken ?? "");
  return NextResponse.json({
    job: {
      ...job,
      payload: {
        ...(job.payload ?? {}),
        qrData: sessionToken ? `${request.nextUrl.origin}/q/status/${sessionToken}` : "",
      },
    },
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ deviceToken: string }> }) {
  const { deviceToken } = await params;
  const body = await request.json().catch(() => ({}));
  const jobId = String(body?.jobId ?? "");
  const success = body?.success === true;
  const errorMessage = body?.error ? String(body.error) : null;
  if (!jobId) return NextResponse.json({ error: "Print job id is required." }, { status: 400 });

  const fenced = body.generation !== undefined || body.attempt !== undefined || body.uncertain !== undefined;
  if (fenced && (!Number.isSafeInteger(body.generation) || body.generation < 0 ||
      !Number.isSafeInteger(body.attempt) || body.attempt < 1 || typeof body.uncertain !== "boolean"))
    return NextResponse.json({ error: "Invalid printer claim." }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fenced ? "complete_print_job_attempt" : "complete_print_job", {
    ...(fenced ? { target_generation: body.generation, target_attempt: body.attempt, target_uncertain: body.uncertain } : {}),
    target_device_token: deviceToken,
    target_job_id: jobId,
    target_success: success,
    target_error: errorMessage,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Print job is no longer claimable." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
