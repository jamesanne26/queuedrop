"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function fail(message: string): never {
  redirect(`/onboarding?error=${encodeURIComponent(message)}`);
}

export async function createBusinessWorkspace(formData: FormData) {
  const businessName = field(formData, "business_name");
  const branchName = field(formData, "branch_name");
  const branchAddress = field(formData, "branch_address");
  const branchPhone = field(formData, "branch_phone");

  if (businessName.length < 2 || businessName.length > 120) {
    fail("Business name must be between 2 and 120 characters.");
  }

  if (branchName.length < 2 || branchName.length > 120) {
    fail("Branch name must be between 2 and 120 characters.");
  }

  if (branchAddress.length > 300) {
    fail("Branch address must be 300 characters or fewer.");
  }

  if (branchPhone.length > 32) {
    fail("Branch phone must be 32 characters or fewer.");
  }

  if (branchPhone && !/^[0-9+() .-]{7,32}$/.test(branchPhone)) {
    fail("Branch phone contains invalid characters.");
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  if (!userId) {
    redirect("/auth/login?next=%2Fonboarding");
  }

  const { data: existingMembership } = await supabase
    .from("business_users")
    .select("business_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (existingMembership) {
    redirect("/dashboard");
  }

  const { error } = await supabase.rpc("create_initial_business_workspace", {
    business_name: businessName,
    branch_name: branchName,
    branch_address: branchAddress || null,
    branch_phone: branchPhone || null,
  });

  if (error) {
    fail(error.message || "Unable to create your QueueDrop workspace.");
  }

  redirect("/dashboard?message=Workspace%20created%20successfully.");
}
