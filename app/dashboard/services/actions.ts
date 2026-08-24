"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}
function servicesUrl(
  branchId: string,
  key: "message" | "error",
  message: string,
) {
  const params = new URLSearchParams();
  if (branchId && branchId !== "all") params.set("branch", branchId);
  params.set(key, message);
  return `/dashboard/services?${params.toString()}`;
}

function fail(message: string, branchId = ""): never {
  redirect(servicesUrl(branchId, "error", message));
}

export async function createService(formData: FormData) {
  const branchId = value(formData, "branch_id");
  const name = value(formData, "name");
  const description = value(formData, "description");
  const queuePrefix = value(formData, "queue_prefix").toUpperCase();
  const estimatedRaw = value(formData, "estimated_minutes");
  const estimatedMinutes = estimatedRaw ? Number(estimatedRaw) : null;

  if (!branchId) fail("Choose a branch.", branchId);
  if (name.length < 2 || name.length > 120) fail("Service name must be between 2 and 120 characters.", branchId);
  if (description.length > 500) fail("Description must be 500 characters or fewer.", branchId);
  if (queuePrefix && !/^[A-Z0-9]{1,6}$/.test(queuePrefix)) fail("Queue prefix must be 1-6 letters or numbers.", branchId);
  if (estimatedMinutes !== null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 480)) {
    fail("Estimated minutes must be a whole number from 1 to 480.", branchId);
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/login?next=%2Fdashboard%2Fservices");

  const { error } = await supabase.rpc("create_service_for_branch", {
    target_branch_id: branchId,
    service_name: name,
    service_description: description || null,
    service_queue_prefix: queuePrefix || null,
    service_estimated_minutes: estimatedMinutes,
  });

  if (error) {
    if (error.code === "23505" || error.message.toLowerCase().includes("duplicate")) fail("That service already exists in this branch.", branchId);
    fail(error.message || "Unable to create service.", branchId);
  }

  redirect(servicesUrl(branchId, "message", "Service created successfully."));
}

export async function updateService(formData: FormData) {
  const serviceId = value(formData, "service_id");
  const branchId = value(formData, "branch_id");
  const name = value(formData, "name");
  const description = value(formData, "description");
  const queuePrefix = value(formData, "queue_prefix").toUpperCase();
  const estimatedRaw = value(formData, "estimated_minutes");
  const estimatedMinutes = estimatedRaw ? Number(estimatedRaw) : null;

  if (!serviceId) fail("Service ID is missing.", branchId);
  if (!branchId || branchId === "all") {
    fail("Choose a branch.", branchId);
  }
  if (name.length < 2 || name.length > 120) {
    fail("Service name must be between 2 and 120 characters.", branchId);
  }
  if (description.length > 500) {
    fail("Description must be 500 characters or fewer.", branchId);
  }
  if (
    queuePrefix &&
    !/^[A-Z0-9]{1,6}$/.test(queuePrefix)
  ) {
    fail("Queue prefix must be 1-6 letters or numbers.", branchId);
  }
  if (
    estimatedMinutes !== null &&
    (!Number.isInteger(estimatedMinutes) ||
      estimatedMinutes < 1 ||
      estimatedMinutes > 480)
  ) {
    fail(
      "Estimated minutes must be a whole number from 1 to 480.",
      branchId,
    );
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect("/auth/login?next=%2Fdashboard%2Fservices");
  }

  const { error } = await supabase.rpc("update_service_for_branch", {
    target_service_id: serviceId,
    target_branch_id: branchId,
    service_name: name,
    service_description: description || null,
    service_queue_prefix: queuePrefix || null,
    service_estimated_minutes: estimatedMinutes,
  });

  if (error) {
    if (
      error.code === "23505" ||
      error.message.toLowerCase().includes("duplicate")
    ) {
      fail("That service already exists in this branch.", branchId);
    }
    fail(error.message || "Unable to update service.", branchId);
  }

  redirect(servicesUrl(branchId, "message", "Service updated successfully."));
}

export async function setServiceActive(formData: FormData) {
  const serviceId = value(formData, "service_id");
  const branchId = value(formData, "branch_id");
  const nextActive = value(formData, "next_active") === "true";
  if (!serviceId) fail("Service ID is missing.", branchId);

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/login?next=%2Fdashboard%2Fservices");

  const { error } = await supabase.rpc("set_service_active", {
    target_service_id: serviceId,
    target_is_active: nextActive,
  });
  if (error) fail(error.message || "Unable to update service.", branchId);

  redirect(
    servicesUrl(
      branchId,
      "message",
      nextActive ? "Service activated." : "Service deactivated.",
    ),
  );
}
