"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateTvSettings } from "@/lib/tv/config";
export async function updateTvSettings(form: FormData) {
  const branchId = String(form.get("branch_id") ?? "").trim();
  const count = Number(form.get("service_count"));
  const ids = form.getAll("service_ids").map(String);
  const target = "/dashboard/settings?view=branch-tv&branch=" + encodeURIComponent(branchId);
  const invalid = validateTvSettings(count, ids);
  if (invalid) redirect(target + "&error=" + encodeURIComponent(invalid));
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/auth/login");
  // RLS is the authoritative business/branch write permission. Validation trigger
  // also rejects inactive or foreign-branch services, including direct API writes.
  const { error } = await supabase.from("branch_tv_settings").upsert({ branch_id: branchId, service_count: count, service_ids: ids }, { onConflict: "branch_id" });
  if (error) redirect(target + "&error=" + encodeURIComponent("Unable to save TV settings. Check branch access and selected active services."));
  revalidatePath("/dashboard/settings"); revalidatePath("/dashboard/tv");
  redirect(target + "&saved=" + Date.now() + "&message=" + encodeURIComponent("TV settings saved."));
}
