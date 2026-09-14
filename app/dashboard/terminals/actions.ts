"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }

export async function createTerminal(formData: FormData) {
  const branchId = field(formData, "branch_id");
  const serviceId = field(formData, "service_id");
  const name = field(formData, "name");
  if (!branchId || !serviceId || !name) redirect(`/dashboard/settings?view=branch-terminals&error=${encodeURIComponent("Branch, default service, and terminal name are required.")}`);
  const supabase = await createClient();
  const { data: service, error: serviceError } = await supabase.from("services")
    .select("id,branch_id")
    .eq("id", serviceId)
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .maybeSingle();
  if (serviceError || !service) redirect(`/dashboard/settings?view=branch-terminals&error=${encodeURIComponent("Selected default service does not belong to the selected branch.")}`);
  const { error } = await supabase.from("devices").insert({
    branch_id: branchId,
    service_id: serviceId,
    name,
    device_type: "ticket_terminal",
    is_active: true,
  });
  if (error) redirect(`/dashboard/settings?view=branch-terminals&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard/terminals");
  revalidatePath("/dashboard/settings");
  redirect(`/dashboard/settings?view=branch-terminals&message=${encodeURIComponent("QueueDrop terminal created.")}`);
}

export async function updateTerminal(formData: FormData) {
  const id = field(formData, "id");
  const branchId = field(formData, "branch_id");
  const serviceId = field(formData, "service_id");
  const name = field(formData, "name");
  if (!id || !branchId || !serviceId || !name) redirect(`/dashboard/settings?view=branch-terminals&error=${encodeURIComponent("Terminal, branch, default service, and name are required.")}`);
  const supabase = await createClient();
  const { data: service, error: serviceError } = await supabase.from("services")
    .select("id,branch_id")
    .eq("id", serviceId)
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .maybeSingle();
  if (serviceError || !service) redirect(`/dashboard/settings?view=branch-terminals&error=${encodeURIComponent("Selected default service does not belong to the selected branch.")}`);
  const { error } = await supabase.from("devices").update({ branch_id: branchId, service_id: serviceId, name }).eq("id", id).eq("device_type", "ticket_terminal");
  if (error) redirect(`/dashboard/settings?view=branch-terminals&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard/terminals");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/get-stub");
  revalidatePath("/dashboard/get-queue");
  redirect(`/dashboard/settings?view=branch-terminals&message=${encodeURIComponent("Terminal branch and default service updated.")}`);
}

export async function deleteTerminal(formData: FormData) {
  const id = field(formData, "id");
  if (!id) return;
  const supabase = await createClient();
  const { error } = await supabase.from("devices").delete().eq("id", id).eq("device_type", "ticket_terminal");
  if (error) redirect(`/dashboard/settings?view=branch-terminals&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard/terminals");
  revalidatePath("/dashboard/settings");
  redirect(`/dashboard/settings?view=branch-terminals&message=${encodeURIComponent("Terminal removed.")}`);
}

export async function updateKioskExitPin(formData: FormData) {
  const pin = field(formData, "kiosk_exit_pin");
  const confirmPin = field(formData, "kiosk_exit_pin_confirm");
  const branchId = field(formData, "branch_id");

  if (!/^\d{4,8}$/.test(pin)) {
    redirect(`/dashboard/settings?view=branch-terminals&error=${encodeURIComponent("Terminal exit PIN must contain 4 to 8 digits.")}#kiosk-security`);
  }
  if (pin !== confirmPin) {
    redirect(`/dashboard/settings?view=branch-terminals&error=${encodeURIComponent("Terminal exit PIN confirmation does not match.")}#kiosk-security`);
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/login?next=%2Fdashboard%2Fsettings");

  const { data: membership } = await supabase.from("business_users")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) redirect("/dashboard");

  const { error } = branchId
    ? await supabase.rpc("set_branch_kiosk_exit_pin", { target_branch_id: branchId, target_pin: pin })
    : await supabase.rpc("set_kiosk_exit_pin", { target_pin: pin });
  if (error) {
    const branch = branchId ? `&branch=${encodeURIComponent(branchId)}` : "";
    redirect(`/dashboard/settings?view=branch-terminals${branch}&error=${encodeURIComponent(error.message)}#kiosk-security`);
  }

  revalidatePath("/dashboard/terminals");
  revalidatePath("/dashboard/settings");
  const branch = branchId ? `&branch=${encodeURIComponent(branchId)}` : "";
  redirect(`/dashboard/settings?view=branch-terminals${branch}&message=${encodeURIComponent(branchId ? "Branch terminal exit PIN updated." : "Terminal exit PIN updated.")}#kiosk-security`);
}
