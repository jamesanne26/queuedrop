"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSystemOwner } from "@/lib/auth/system-owner";
import { createClient } from "@/lib/supabase/server";
import { normalizePlatformContact } from "@/lib/platform/contact";
export async function updatePlatformContact(form: FormData) {
  await requireSystemOwner();
  let phone: string | null;
  try { phone = normalizePlatformContact(String(form.get("contact_phone") ?? "")); }
  catch { redirect("/system/settings?error=" + encodeURIComponent("Enter a valid international or Philippine mobile number.")); }
  const supabase = await createClient();
  const { error } = await supabase.from("platform_public_contact").upsert({ id: true, phone }, { onConflict: "id" });
  if (error) redirect("/system/settings?error=" + encodeURIComponent("Unable to save. An active platform owner is required."));
  revalidatePath("/system/settings"); revalidatePath("/q/status/[token]", "page");
  redirect("/system/settings?message=" + encodeURIComponent("Public contact saved."));
}
