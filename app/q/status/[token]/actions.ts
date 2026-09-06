"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updateSmsNumber(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!token) redirect("/");
  if (!/^[0-9]{1,20}$/.test(phone)) {
    redirect(`/q/status/${encodeURIComponent(token)}?error=${encodeURIComponent("Mobile number must contain numbers only.")}`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_stub_sms_number", {
    target_session_token: token,
    target_phone: phone,
  });
  if (error) redirect(`/q/status/${encodeURIComponent(token)}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/q/status/${token}`);
  redirect(`/q/status/${encodeURIComponent(token)}?message=${encodeURIComponent("SMS alerts enabled for this stub.")}`);
}
