"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function fail(message: string): never {
  redirect(`/dashboard/branches?error=${encodeURIComponent(message)}`);
}

export async function createBranch(formData: FormData) {
  const name = value(formData, "name");
  const address = value(formData, "address");
  const phone = value(formData, "phone");

  if (name.length < 2 || name.length > 120) fail("Branch name must be between 2 and 120 characters.");
  if (address.length > 300) fail("Address must be 300 characters or fewer.");
  if (phone.length > 32) fail("Phone must be 32 characters or fewer.");
  if (phone && !/^[0-9+() .-]{7,32}$/.test(phone)) fail("Phone contains invalid characters.");

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) redirect("/auth/login?next=%2Fdashboard%2Fbranches");

  const { error } = await supabase.rpc("create_branch_with_defaults", {
    branch_name: name,
    branch_address: address || null,
    branch_phone: phone || null,
  });

  if (error) {
    if (error.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
      fail("A branch with that name already exists in this business.");
    }
    fail(error.message || "Unable to create branch.");
  }

  redirect("/dashboard/branches?message=Branch%20created%20successfully.");
}
