import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ deviceToken: string }> }) {
  const { deviceToken } = await params;
  const supabase = await createClient();
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

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_print_job", {
    target_device_token: deviceToken,
    target_job_id: jobId,
    target_success: success,
    target_error: errorMessage,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Print job is no longer claimable." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
