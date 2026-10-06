"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function reprintStub(formData: FormData) {
  if (formData.get("checked_paper") !== "yes") redirect("/dashboard/terminals?error=Check%20the%20printer%20before%20reprinting");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("requeue_print_job", { target_job_id: String(formData.get("job_id") ?? "") });
  if (error || !data) redirect("/dashboard/terminals?error=" + encodeURIComponent(error?.message ?? "Print job could not be requeued"));
  redirect("/dashboard/terminals?message=Same%20stub%20queued%20for%20reprint");
}
