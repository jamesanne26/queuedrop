"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dispatchSmsAfterQueueChange } from "@/lib/notifications/sms";

export async function updateCustomerTicket(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!token) redirect("/");
  if (!/^[0-9]{1,20}$/.test(phone)) {
    redirect(
      `/q/status/${encodeURIComponent(token)}?error=${encodeURIComponent(
        "Mobile number must contain numbers only.",
      )}`,
    );
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_public_ticket_customer", { target_session_token: token, target_name: name, target_phone: phone });
  if (error) redirect(`/q/status/${encodeURIComponent(token)}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/q/status/${token}`);
  redirect(`/q/status/${encodeURIComponent(token)}?message=${encodeURIComponent("Queue details updated.")}`);
}

export async function leaveQueue(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const exitCode = String(formData.get("exit_code") ?? "").trim().toUpperCase();
  if (!token) redirect("/");
  if (!/^[A-Z0-9]{6}$/.test(exitCode)) {
    redirect(`/q/status/${encodeURIComponent(token)}?error=${encodeURIComponent("Enter the 6-character exit code.")}`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_public_queue", { target_session_token: token, target_exit_code: exitCode });
  if (error) redirect(`/q/status/${encodeURIComponent(token)}?error=${encodeURIComponent(error.message)}`);
  await dispatchSmsAfterQueueChange();
  revalidatePath(`/q/status/${token}`);
  redirect(`/q/status/${encodeURIComponent(token)}?message=${encodeURIComponent("You left the queue.")}`);
}


export async function moveDownOnePlace(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const confirmationCode = String(formData.get("confirmation_code") ?? "").trim().toUpperCase();
  if (!token) redirect("/");
  if (!/^[A-Z0-9]{6}$/.test(confirmationCode)) {
    redirect(`/q/status/${encodeURIComponent(token)}?error=${encodeURIComponent("Enter the 6-character confirmation code.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("move_public_ticket_down_one", {
    target_session_token: token,
    target_confirmation_code: confirmationCode,
  });
  if (error) {
    redirect(`/q/status/${encodeURIComponent(token)}?error=${encodeURIComponent(error.message)}`);
  }

  await dispatchSmsAfterQueueChange();
  revalidatePath(`/q/status/${token}`);
  redirect(`/q/status/${encodeURIComponent(token)}?message=${encodeURIComponent("You moved down one place in the queue.")}`);
}
