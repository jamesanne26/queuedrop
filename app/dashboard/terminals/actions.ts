"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }

export async function createTerminal(formData: FormData) {
  const branchId = field(formData, "branch_id");
  const serviceId = field(formData, "service_id");
  const name = field(formData, "name");
  if (!branchId || !serviceId || !name) redirect(`/dashboard/terminals?error=${encodeURIComponent("Branch, default service, and terminal name are required.")}`);
  const supabase = await createClient();
  const { data: service, error: serviceError } = await supabase.from("services")
    .select("id,branch_id")
    .eq("id", serviceId)
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .maybeSingle();
  if (serviceError || !service) redirect(`/dashboard/terminals?error=${encodeURIComponent("Selected default service does not belong to the selected branch.")}`);
  const { error } = await supabase.from("devices").insert({
    branch_id: branchId,
    service_id: serviceId,
    name,
    device_type: "ticket_terminal",
    is_active: true,
  });
  if (error) redirect(`/dashboard/terminals?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard/terminals");
  redirect(`/dashboard/terminals?message=${encodeURIComponent("QueueDrop terminal created.")}`);
}

export async function updateTerminal(formData: FormData) {
  const id = field(formData, "id");
  const branchId = field(formData, "branch_id");
  const serviceId = field(formData, "service_id");
  const name = field(formData, "name");
  if (!id || !branchId || !serviceId || !name) redirect(`/dashboard/terminals?error=${encodeURIComponent("Terminal, branch, default service, and name are required.")}`);
  const supabase = await createClient();
  const { data: service, error: serviceError } = await supabase.from("services")
    .select("id,branch_id")
    .eq("id", serviceId)
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .maybeSingle();
  if (serviceError || !service) redirect(`/dashboard/terminals?error=${encodeURIComponent("Selected default service does not belong to the selected branch.")}`);
  const { error } = await supabase.from("devices").update({ branch_id: branchId, service_id: serviceId, name }).eq("id", id).eq("device_type", "ticket_terminal");
  if (error) redirect(`/dashboard/terminals?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard/terminals");
  revalidatePath("/dashboard/get-stub");
  revalidatePath("/dashboard/get-queue");
  redirect(`/dashboard/terminals?message=${encodeURIComponent("Terminal branch and default service updated.")}`);
}

export async function deleteTerminal(formData: FormData) {
  const id = field(formData, "id");
  if (!id) return;
  const supabase = await createClient();
  const { error } = await supabase.from("devices").delete().eq("id", id).eq("device_type", "ticket_terminal");
  if (error) redirect(`/dashboard/terminals?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard/terminals");
  redirect(`/dashboard/terminals?message=${encodeURIComponent("Terminal removed.")}`);
}
