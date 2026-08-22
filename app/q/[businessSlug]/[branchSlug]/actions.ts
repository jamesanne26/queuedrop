"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function queueUrl(businessSlug: string, branchSlug: string, message: string) {
  return `/q/${encodeURIComponent(businessSlug)}/${encodeURIComponent(branchSlug)}?error=${encodeURIComponent(message)}`;
}

export async function joinQueue(formData: FormData) {
  const businessSlug = field(formData, "business_slug");
  const branchSlug = field(formData, "branch_slug");
  const serviceId = field(formData, "service_id");
  const name = field(formData, "name");
  const phone = field(formData, "phone").replace(/[\s-]/g, "");

  if (!businessSlug || !branchSlug || !serviceId) {
    redirect(queueUrl(businessSlug, branchSlug, "Queue information is incomplete."));
  }
  if (name.length < 1 || name.length > 100) {
    redirect(queueUrl(businessSlug, branchSlug, "Name must be between 1 and 100 characters."));
  }
  if (/[<>{}\[\]]/.test(name)) {
    redirect(queueUrl(businessSlug, branchSlug, "Name contains unsupported characters."));
  }
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) {
    redirect(queueUrl(businessSlug, branchSlug, "Use a mobile number with country code, for example +639171234567."));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_public_queue", {
    target_business_slug: businessSlug,
    target_branch_slug: branchSlug,
    target_service_id: serviceId,
    customer_name: name,
    customer_phone: phone,
  });

  if (error) {
    redirect(queueUrl(businessSlug, branchSlug, error.message || "Unable to join the queue."));
  }

  const result = data as { session_token?: string } | null;
  if (!result?.session_token) {
    redirect(queueUrl(businessSlug, branchSlug, "Queue ticket was not created."));
  }

  redirect(`/q/status/${encodeURIComponent(result.session_token)}`);
}
