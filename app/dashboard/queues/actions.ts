"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Queue action failed.";
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
    redirect(`/dashboard/queues?branch=${encodeURIComponent(branchId)}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard/queues");
  redirect(`/dashboard/queues?branch=${encodeURIComponent(branchId)}&success=${encodeURIComponent("Next customer called")}`);
}

export async function updateTicketAction(formData: FormData) {
  const branchId = String(formData.get("branch_id") ?? "");
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
    redirect(`/dashboard/queues?branch=${encodeURIComponent(branchId)}&error=${encodeURIComponent(errorMessage(error))}`);
  }

  revalidatePath("/dashboard/queues");
  redirect(`/dashboard/queues?branch=${encodeURIComponent(branchId)}&success=${encodeURIComponent("Queue updated")}`);
}

export async function updateCustomerDetailsAction(formData: FormData) {
  const branchId = String(formData.get("branch_id") ?? "");
  const ticketId = String(formData.get("ticket_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!branchId || !ticketId) redirect("/dashboard/queues?error=Missing%20ticket%20details");
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/login?next=%2Fdashboard%2Fqueues");
  const { error } = await supabase.rpc("update_ticket_customer_by_operator", { target_ticket_id: ticketId, target_name: name, target_phone: phone });
  if (error) redirect(`/dashboard/queues?branch=${encodeURIComponent(branchId)}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard/queues");
  redirect(`/dashboard/queues?branch=${encodeURIComponent(branchId)}&success=${encodeURIComponent("Customer queue details updated")}`);
}
