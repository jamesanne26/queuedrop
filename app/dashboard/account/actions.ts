"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function fail(message: string): never {
  redirect(`/dashboard/account?error=${encodeURIComponent(message)}`);
}

export async function updateOwnAccount(formData: FormData) {
  const fullName = value(formData, "full_name");
  const phone = value(formData, "phone");

  if (fullName.length < 2 || fullName.length > 100) fail("Full name must be between 2 and 100 characters.");
  if (phone && !/^[0-9]{7,20}$/.test(phone)) fail("Mobile number must contain numbers only.");

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect("/auth/login?next=%2Fdashboard%2Faccount");

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone: phone || null })
    .eq("id", auth.user.id);

  if (profileError) fail(profileError.message || "Unable to update your account.");

  const { error: metadataError } = await supabase.auth.updateUser({ data: { full_name: fullName } });
  if (metadataError) fail(metadataError.message || "Account was saved, but login profile metadata could not be updated.");

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/account");
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/account?message=Account%20updated%20successfully.");
}
