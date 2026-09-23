"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSystemOwner } from "@/lib/auth/system-owner";
import { dispatchSmsAfterQueueChange } from "@/lib/notifications/sms";

function queueRedirectUrl(branchId: string, serviceId?: string, key: "success" | "error" = "success", message?: string) {
  const params = new URLSearchParams();
  if (branchId) params.set("branch", branchId);
  if (serviceId) params.set("service", serviceId);
  if (message) params.set(key, message);
  return `/dashboard/queues?${params.toString()}`;
}

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/auth/login?next=%2Fdashboard%2Fqueues");
  return { supabase, user: data.user };
}


export async function simulateGetStubAction(formData: FormData) {
  const branchId = String(formData.get("branch_id") ?? "");
  const serviceId = String(formData.get("service_id") ?? "");
  if (!branchId || !serviceId) redirect("/dashboard/queues?error=Missing%20branch%20or%20service");

  const { supabase, user } = await requireUser();

  const [{ data: membership }, developer] = await Promise.all([
    supabase.from("business_users").select("business_id, role").eq("user_id", user.id).eq("is_active", true).limit(1).maybeSingle(),
    isSystemOwner(user),
  ]);
  if (!membership) redirect("/dashboard/queues?error=No%20active%20business%20membership");
  if (!developer && membership.role !== "owner" && membership.role !== "admin") {
    redirect(queueRedirectUrl(branchId, serviceId, "error", "Get test stub is available only to the developer and client administrators"));
  }

  const [{ data: service }, { data: branch }] = await Promise.all([
    supabase.from("services").select("id, branch_id").eq("id", serviceId).eq("branch_id", branchId).eq("is_active", true).maybeSingle(),
    supabase.from("branches").select("id, business_id").eq("id", branchId).maybeSingle(),
  ]);
  if (!service || !branch || branch.business_id !== membership.business_id) {
    redirect(queueRedirectUrl(branchId, serviceId, "error", "Selected service is not available for this client"));
  }

  let { data: terminal } = await supabase.from("devices")
    .select("id, device_token")
    .eq("branch_id", branchId).eq("service_id", serviceId).eq("device_type", "ticket_terminal")
    .eq("is_active", true).order("created_at", { ascending: true }).limit(1).maybeSingle();

  if (!terminal) {
    const { data: created, error: createError } = await supabase.from("devices")
      .insert({ branch_id: branchId, service_id: serviceId, name: "Queue View Simulator", device_type: "ticket_terminal", is_active: true })
      .select("id, device_token").single();
    if (createError || !created) redirect(queueRedirectUrl(branchId, serviceId, "error", createError?.message ?? "Unable to create test terminal"));
    terminal = created;
  }

  const { data: issued, error } = await supabase.rpc("issue_stub_ticket", { target_device_token: terminal.device_token });
  if (error) redirect(queueRedirectUrl(branchId, serviceId, "error", error.message));

  revalidatePath("/dashboard/queues");
  const displayNumber = issued && typeof issued === "object" && "display_number" in issued ? String((issued as { display_number?: unknown }).display_number ?? "") : "";
  redirect(queueRedirectUrl(branchId, serviceId, "success", displayNumber ? `Test stub ${displayNumber} issued` : "Test stub issued"));
}

export async function simulateGetStubInlineAction(branchId: string, serviceId: string) {
  if (!branchId || !serviceId) return { ok: false as const, message: "Missing branch or service" };

  const { supabase, user } = await requireUser();
  const [{ data: membership }, developer] = await Promise.all([
    supabase.from("business_users").select("business_id, role").eq("user_id", user.id).eq("is_active", true).limit(1).maybeSingle(),
    isSystemOwner(user),
  ]);
  if (!membership) return { ok: false as const, message: "No active business membership" };
  if (!developer && membership.role !== "owner" && membership.role !== "admin") {
    return { ok: false as const, message: "Get test stub is available only to the developer and client administrators" };
  }

  const [{ data: service }, { data: branch }] = await Promise.all([
    supabase.from("services").select("id, branch_id").eq("id", serviceId).eq("branch_id", branchId).eq("is_active", true).maybeSingle(),
    supabase.from("branches").select("id, business_id").eq("id", branchId).maybeSingle(),
  ]);
  if (!service || !branch || branch.business_id !== membership.business_id) {
    return { ok: false as const, message: "Selected service is not available for this client" };
  }

  let { data: terminal } = await supabase.from("devices")
    .select("id, device_token")
    .eq("branch_id", branchId).eq("service_id", serviceId).eq("device_type", "ticket_terminal")
    .eq("is_active", true).order("created_at", { ascending: true }).limit(1).maybeSingle();

  if (!terminal) {
    const { data: created, error: createError } = await supabase.from("devices")
      .insert({ branch_id: branchId, service_id: serviceId, name: "Queue View Simulator", device_type: "ticket_terminal", is_active: true })
      .select("id, device_token").single();
    if (createError || !created) return { ok: false as const, message: createError?.message ?? "Unable to create test terminal" };
    terminal = created;
  }

  const { data: issued, error } = await supabase.rpc("issue_stub_ticket", { target_device_token: terminal.device_token });
  if (error) return { ok: false as const, message: error.message };

  // The live workspace receives this insert through Realtime and also runs a
  // lightweight reconciliation query. Invalidating the whole route here made
  // every test-stub request trigger an unnecessary server render.
  const issuedTicket = issued && typeof issued === "object" ? issued as Record<string, unknown> : null;
  const displayNumber = issuedTicket
    ? String(issuedTicket.display_number ?? "")
    : "";
  return {
    ok: true as const,
    message: displayNumber ? `Test stub ${displayNumber} issued` : "Test stub issued",
    ticket: issuedTicket ? {
      id: String(issuedTicket.ticket_id ?? ""),
      display_number: displayNumber || "Queue",
      status: "waiting" as const,
      position: Number(issuedTicket.position ?? 0) || null,
      service_id: serviceId,
      service_name: String(issuedTicket.service_name ?? "Service"),
      session_token: issuedTicket.session_token ? String(issuedTicket.session_token) : null,
    } : null,
  };
}

export async function callNextAction(formData: FormData) {
  const branchId = String(formData.get("branch_id") ?? "");
  const serviceId = String(formData.get("service_id") ?? "");
  if (!branchId || !serviceId) redirect("/dashboard/queues?error=Missing%20branch%20or%20service");

  const { supabase } = await requireUser();
  // qd_staff_call_next performs the authoritative permission check in the
  // database. Avoid doing the same membership lookup twice on every click.
  const { error } = await supabase.rpc("qd_staff_call_next", { target_branch_id: branchId, target_service_id: serviceId });
  if (error) redirect(queueRedirectUrl(branchId, serviceId, "error", error.message));

  // Live Queue is realtime-first. Do not redirect/reload the workspace after a
  // successful high-frequency operator action: a navigation keeps the command
  // bar pending even after the ticket has already moved on screen. Realtime
  // applies the database change immediately and the 2.5s reconciliation loop
  // remains as a safety net for dropped websocket events.
  after(() => dispatchSmsAfterQueueChange(branchId));
}

export async function returnLastCustomerAction(formData: FormData) {
  const branchId = String(formData.get("branch_id") ?? "");
  const serviceId = String(formData.get("service_id") ?? "");
  if (!branchId || !serviceId) redirect("/dashboard/queues?error=Missing%20branch%20or%20service");

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("qd_staff_return_last_to_queue", { target_branch_id: branchId, target_service_id: serviceId });
  if (error) redirect(queueRedirectUrl(branchId, serviceId, "error", error.message));

  after(() => dispatchSmsAfterQueueChange(branchId));
}

export async function updateTicketAction(formData: FormData) {
  const branchId = String(formData.get("branch_id") ?? "");
  const serviceId = String(formData.get("service_id") ?? "");
  const ticketId = String(formData.get("ticket_id") ?? "");
  const action = String(formData.get("action") ?? "");
  if (!branchId || !ticketId || !action) redirect("/dashboard/queues?error=Missing%20ticket%20action%20details");

  if (action === "cancel" || action === "return_last") {
    const expectedCode = String(formData.get("expected_code") ?? "").trim();
    const confirmCode = String(formData.get("confirm_code") ?? "").trim();
    if (!expectedCode || confirmCode !== expectedCode) {
      redirect(queueRedirectUrl(branchId, serviceId, "error", action === "cancel" ? "Cancellation verification code did not match" : "Return-to-last verification code did not match"));
    }
  }

  const { supabase } = await requireUser();
  // Both protected RPCs below enforce the role/permission matrix themselves.
  if (action === "return_last") {
    const { error } = await supabase.rpc("qd_staff_return_ticket_to_last", { target_ticket_id: ticketId });
    if (error) redirect(queueRedirectUrl(branchId, serviceId, "error", error.message));
  } else {
    const { error } = await supabase.rpc("qd_staff_update_ticket_status", { target_ticket_id: ticketId, target_action: action });
    if (error) redirect(queueRedirectUrl(branchId, serviceId, "error", error.message));
  }

  after(() => dispatchSmsAfterQueueChange(branchId));
}

export type ServiceHistoryTicket = {
  id: string;
  display_number: string;
  status: "completed" | "cancelled" | "no_show";
  branch_id: string;
  branch_name: string;
  service_name: string;
  joined_at: string;
  called_at: string | null;
  serving_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
};

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function loadServiceHistoryAction(selectedBranchId: string): Promise<ServiceHistoryTicket[]> {
  const { supabase, user } = await requireUser();

  const { data: membership } = await supabase.from("business_users").select("business_id, role, can_view_history").eq("user_id", user.id).eq("is_active", true).limit(1).maybeSingle();
  if (!membership) return [];
  if (membership.role !== "owner" && membership.role !== "admin" && !membership.can_view_history) return [];

  const role = membership.role as "owner" | "admin" | "manager" | "staff";
  let branchIds: string[] = [];
  if (role === "owner" || role === "admin") {
    const { data } = await supabase.from("branches").select("id").eq("business_id", membership.business_id);
    branchIds = (data ?? []).map((row) => row.id);
  } else if (role === "manager") {
    const { data } = await supabase.from("branch_users").select("branch_id").eq("user_id", user.id);
    branchIds = (data ?? []).map((row) => row.branch_id);
  } else {
    const { data } = await supabase.from("branch_users").select("branch_id").eq("user_id", user.id).eq("branch_id", selectedBranchId).maybeSingle();
    branchIds = data ? [selectedBranchId] : [];
  }
  if (!branchIds.length) return [];

  const [{ data: branches }, { data: rawHistory }] = await Promise.all([
    supabase.from("branches").select("id, name").in("id", branchIds),
    supabase.from("tickets")
      .select("id, display_number, status, joined_at, called_at, serving_at, completed_at, cancelled_at, branch_id, services(name)")
      .in("branch_id", branchIds)
      .in("status", ["completed", "cancelled", "no_show"])
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const branchNameById = new Map((branches ?? []).map((branch) => [branch.id, branch.name]));
  return (rawHistory ?? []).map((ticket) => ({
    id: ticket.id,
    display_number: ticket.display_number,
    status: ticket.status as "completed" | "cancelled" | "no_show",
    branch_id: ticket.branch_id,
    branch_name: branchNameById.get(ticket.branch_id) ?? "Branch",
    service_name: relationOne(ticket.services)?.name ?? "Service",
    joined_at: ticket.joined_at,
    called_at: ticket.called_at,
    serving_at: ticket.serving_at,
    completed_at: ticket.completed_at,
    cancelled_at: ticket.cancelled_at,
  }));
}
