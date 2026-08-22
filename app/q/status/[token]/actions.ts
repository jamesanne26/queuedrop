"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updateCustomerTicket(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!token) redirect("/");
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_public_ticket_customer", { target_session_token: token, target_name: name, target_phone: phone });
  if (error) redirect(`/q/status/${encodeURIComponent(token)}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/q/status/${token}`);
  redirect(`/q/status/${encodeURIComponent(token)}?message=${encodeURIComponent("Queue details updated.")}`);
}
