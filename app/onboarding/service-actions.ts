"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }
function fail(branchId: string, message: string): never {
  redirect(`/onboarding/service?branch=${encodeURIComponent(branchId)}&error=${encodeURIComponent(message)}`);
}

export async function createFirstService(formData: FormData) {
  const branchId = field(formData, "branch_id");
  const name = field(formData, "name");
  const group = field(formData, "service_group");
  const description = field(formData, "description");
  const prefix = field(formData, "queue_prefix").toUpperCase();
  const estimatedRaw = field(formData, "estimated_minutes");
  const estimated = estimatedRaw ? Number(estimatedRaw) : null;

  if (!branchId) redirect("/dashboard");
  if (name.length < 2 || name.length > 120) fail(branchId, "Service name must be between 2 and 120 characters.");
  if (group.length > 80) fail(branchId, "Service group must be 80 characters or fewer.");
  if (description.length > 500) fail(branchId, "Description must be 500 characters or fewer.");
  if (prefix && !/^[A-Z0-9]{1,6}$/.test(prefix)) fail(branchId, "Queue prefix must be 1-6 letters or numbers.");
  if (estimated !== null && (!Number.isInteger(estimated) || estimated < 1 || estimated > 480)) fail(branchId, "Estimated minutes must be a whole number from 1 to 480.");

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/login?next=%2Fonboarding%2Fservice");

  const { error } = await supabase.rpc("create_initial_branch_service", {
    target_branch_id: branchId,
    service_name: name,
    service_group: group || null,
    service_description: description || null,
    service_queue_prefix: prefix || null,
    service_estimated_minutes: estimated,
  });
  if (error) fail(branchId, error.message || "Unable to create the first service.");

  // Redirecting already streams a fresh destination payload. Broad path
  // invalidation made this first save wait for several unrelated dashboards.
  redirect(`/dashboard/services?branch=${encodeURIComponent(branchId)}&message=${encodeURIComponent("Workspace setup complete. Your first service is ready.")}`);
}

export async function skipFirstService(formData: FormData) {
  const branchId = field(formData, "branch_id");
  redirect(branchId ? `/dashboard/settings?branch=${encodeURIComponent(branchId)}&view=branch-services` : "/dashboard");
}
