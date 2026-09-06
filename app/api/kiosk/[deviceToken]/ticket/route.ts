import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ deviceToken: string }> }) {
  const { deviceToken } = await params;
  const body = await request.json().catch(() => ({}));
  const serviceId = String(body?.serviceId ?? "").trim();
  if (!serviceId) return NextResponse.json({ error: "Choose a service first." }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_stub_ticket_for_service", {
    target_device_token: deviceToken,
    target_service_id: serviceId,
  });
  if (error || !data) return NextResponse.json({ error: error?.message || "Unable to issue stub." }, { status: 400 });
  const ticket = data as Record<string, unknown> & { session_token: string };
  const origin = request.nextUrl.origin;
  return NextResponse.json({ ...ticket, status_url: `${origin}/q/status/${ticket.session_token}` });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ deviceToken: string }> }) {
  const { deviceToken } = await params;
  const body = await request.json().catch(() => ({}));
  const ticketId = String(body?.ticketId ?? "");
  const printJobId = String(body?.printJobId ?? "");
  if (!ticketId || !printJobId) return NextResponse.json({ error: "Ticket id and print job id are required." }, { status: 400 });
  const supabase = await createClient();
  const { error: ticketError } = await supabase.rpc("mark_stub_ticket_printed", {
    target_device_token: deviceToken,
    target_ticket_id: ticketId,
  });
  if (ticketError) return NextResponse.json({ error: ticketError.message }, { status: 400 });
  const { data, error } = await supabase.rpc("complete_print_job", {
    target_device_token: deviceToken,
    target_job_id: printJobId,
    target_success: true,
    target_error: null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: Boolean(data) });
}
