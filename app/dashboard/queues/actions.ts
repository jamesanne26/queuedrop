"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AssistedJoinState = {
  ok: boolean;
  message: string;
  requestId: string | null;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return "Queue action failed.";
}


function queueRedirectUrl(
  branchId: string,
  serviceId?: string,
  key: "success" | "error" = "success",
  message?: string,
) {
  const params = new URLSearchParams();
  if (branchId) params.set("branch", branchId);
  if (serviceId) params.set("service", serviceId);
  if (message) params.set(key, message);
  return `/dashboard/queues?${params.toString()}`;
}

export async function callNextAction(formData: FormData) {
  const branchId = String(formData.get("branch_id") ?? "");
  const serviceId = String(formData.get("service_id") ?? "");

  if (!branchId || !serviceId) {
    redirect("/dashboard/queues?error=Missing%20branch%20or%20service");
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/login?next=%2Fdashboard%2Fqueues");

  const { error } = await supabase.rpc("staff_call_next", {
    target_branch_id: branchId,
    target_service_id: serviceId,
  });

  if (error) {
    redirect(
      queueRedirectUrl(branchId, serviceId, "error", error.message),
    );
  }

  revalidatePath("/dashboard/queues");
  redirect(
    queueRedirectUrl(branchId, serviceId, "success", "Next customer called"),
  );
}

export async function updateTicketAction(formData: FormData) {
  const branchId = String(formData.get("branch_id") ?? "");
  const serviceId = String(formData.get("service_id") ?? "");
  const ticketId = String(formData.get("ticket_id") ?? "");
  const action = String(formData.get("action") ?? "");

  if (!branchId || !ticketId || !action) {
    redirect("/dashboard/queues?error=Missing%20ticket%20action%20details");
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/login?next=%2Fdashboard%2Fqueues");

  try {
    const { error } = await supabase.rpc("staff_update_ticket_status", {
      target_ticket_id: ticketId,
      target_action: action,
    });

    if (error) throw error;
  } catch (error) {
    redirect(
      queueRedirectUrl(
        branchId,
        serviceId,
        "error",
        errorMessage(error),
      ),
    );
  }

  revalidatePath("/dashboard/queues");
  redirect(
    queueRedirectUrl(branchId, serviceId, "success", "Queue updated"),
  );
}

export async function updateCustomerDetailsAction(formData: FormData) {
  const branchId = String(formData.get("branch_id") ?? "");
  const serviceId = String(formData.get("service_id") ?? "");
  const ticketId = String(formData.get("ticket_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!branchId || !ticketId) {
    redirect("/dashboard/queues?error=Missing%20ticket%20details");
  }

  if (!/^[0-9]{1,20}$/.test(phone)) {
    redirect(
      queueRedirectUrl(
        branchId,
        serviceId,
        "error",
        "Mobile number must contain numbers only.",
      ),
    );
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/login?next=%2Fdashboard%2Fqueues");

  const { error } = await supabase.rpc(
    "update_ticket_customer_by_operator",
    {
      target_ticket_id: ticketId,
      target_name: name,
      target_phone: phone,
    },
  );

  if (error) {
    redirect(
      queueRedirectUrl(branchId, serviceId, "error", error.message),
    );
  }

  revalidatePath("/dashboard/queues");
  redirect(
    queueRedirectUrl(
      branchId,
      serviceId,
      "success",
      "Customer queue details updated",
    ),
  );
}

export async function staffAssistedJoinAction(
  _previousState: AssistedJoinState,
  formData: FormData,
): Promise<AssistedJoinState> {
  const branchId = String(formData.get("branch_id") ?? "").trim();
  const serviceId = String(formData.get("service_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!branchId || !serviceId) {
    return { ok: false, message: "Branch and service are required.", requestId: null };
  }

  if (name.length < 1 || name.length > 100 || /[<>{}\[\]]/.test(name)) {
    return { ok: false, message: "Enter a valid customer name.", requestId: null };
  }
  if (!phone) {
    return { ok: false, message: "Mobile number is required.", requestId: null };
  }
  if (!/^[0-9]{1,20}$/.test(phone)) {
    return {
      ok: false,
      message: "Mobile number must contain numbers only.",
      requestId: null,
    };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return { ok: false, message: "Your staff session has expired.", requestId: null };
  }

  const { data, error } = await supabase.rpc("staff_assisted_join_queue", {
    target_branch_id: branchId,
    target_service_id: serviceId,
    customer_name: name,
    customer_phone: phone,
  });

  if (error) {
    return {
      ok: false,
      message: error.message || "Unable to add the customer to the queue.",
      requestId: null,
    };
  }

  const result = data as { display_number?: string } | null;

  revalidatePath("/dashboard/queues");

  return {
    ok: true,
    requestId: crypto.randomUUID(),
    message: result?.display_number
      ? `${result.display_number} added to the queue.`
      : "Customer added to the queue.",
  };
}

export type ServiceHistoryTicket = {
  id: string;
  display_number: string;
  status: "completed" | "cancelled" | "no_show";
  branch_id: string;
  branch_name: string;
  service_name: string;
  customer_name: string;
  customer_phone: string;
  joined_at: string;
  called_at: string | null;
  serving_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
};

export type TicketCustomerChange = {
  id: string;
  field_name: "name" | "mobile";
  old_value: string | null;
  new_value: string | null;
  changed_by_type: string;
  created_at: string;
};

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function loadTicketChangeHistoryAction(
  ticketId: string,
): Promise<TicketCustomerChange[]> {
  if (!ticketId) return [];

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data, error } = await supabase
    .from("ticket_customer_changes")
    .select(
      "id, field_name, old_value, new_value, changed_by_type, created_at",
    )
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false });

  if (error) { console.error("loadTicketChangeHistoryAction:", error); return []; }
  return (data ?? []) as TicketCustomerChange[];
}

export async function loadServiceHistoryAction(
  selectedBranchId: string,
): Promise<ServiceHistoryTicket[]> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return [];

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!membership) return [];

  const role = membership.role as "owner" | "admin" | "manager" | "staff";
  let branchIds: string[] = [];

  if (role === "owner" || role === "admin") {
    const { data: branches } = await supabase
      .from("branches")
      .select("id")
      .eq("business_id", membership.business_id);
    branchIds = (branches ?? []).map((branch) => branch.id);
  } else if (role === "manager") {
    const { data: assignments } = await supabase
      .from("branch_users")
      .select("branch_id")
      .eq("user_id", user.id);
    branchIds = (assignments ?? []).map((row) => row.branch_id);
  } else {
    const { data: assignment } = await supabase
      .from("branch_users")
      .select("branch_id")
      .eq("user_id", user.id)
      .eq("branch_id", selectedBranchId)
      .maybeSingle();
    branchIds = assignment ? [selectedBranchId] : [];
  }

  if (!branchIds.length) return [];

  const [{ data: branches }, { data: rawHistory }] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name")
      .in("id", branchIds),
    supabase
      .from("tickets")
      .select(
        "id, display_number, status, joined_at, called_at, serving_at, completed_at, cancelled_at, branch_id, customer_name_override, customer_phone_override, customers(name, phone), services(name)",
      )
      .in("branch_id", branchIds)
      .in("status", ["completed", "cancelled", "no_show"])
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const branchNameById = new Map(
    (branches ?? []).map((branch) => [branch.id, branch.name]),
  );

  return (rawHistory ?? []).map((ticket) => {
    const customer = relationOne(ticket.customers);
    const service = relationOne(ticket.services);

    return {
      id: ticket.id,
      display_number: ticket.display_number,
      status: ticket.status as "completed" | "cancelled" | "no_show",
      branch_id: ticket.branch_id,
      branch_name: branchNameById.get(ticket.branch_id) ?? "Branch",
      service_name: service?.name ?? "Service",
      customer_name:
        ticket.customer_name_override ?? customer?.name ?? "Customer",
      customer_phone:
        ticket.customer_phone_override ?? customer?.phone ?? "—",
      joined_at: ticket.joined_at,
      called_at: ticket.called_at,
      serving_at: ticket.serving_at,
      completed_at: ticket.completed_at,
      cancelled_at: ticket.cancelled_at,
    };
  });
}

