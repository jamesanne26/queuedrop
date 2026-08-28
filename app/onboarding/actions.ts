"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  if (branchPhone.length > 20) {
    fail("Branch phone must be 20 digits or fewer.");
  }

  if (branchPhone && !/^[0-9]{7,20}$/.test(branchPhone)) {
    fail("Branch phone must contain numbers only.");
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

  // Every self-service signup starts on the configurable Starter trial so plan
  // limits apply immediately instead of leaving new workspaces unmetered.
  const { data: businessId } = await supabase.rpc("get_current_admin_business_id");
  if (businessId) {
    const admin = createAdminClient();
    const { data: starter } = await admin
      .from("plans")
      .select("id,price_monthly,currency,trial_days")
      .eq("name", "Starter")
      .eq("is_active", true)
      .maybeSingle();
    if (starter) {
      const startedAt = new Date();
      const expiresAt = new Date(startedAt);
      expiresAt.setDate(expiresAt.getDate() + Number(starter.trial_days ?? 14));
      await admin.from("business_subscriptions").upsert({
        business_id: businessId,
        plan_id: starter.id,
        status: "trialing",
        started_at: startedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        billing_price_monthly: starter.price_monthly,
        billing_currency: starter.currency,
        updated_at: startedAt.toISOString(),
      }, { onConflict: "business_id" });
    }
  }

  redirect("/dashboard?message=Workspace%20created%20successfully.%20Your%20Starter%20trial%20is%20active.");
}
