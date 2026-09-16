"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DAYS, TIMEZONES } from "./constants";
import { isOwnerOrAdmin } from "@/lib/auth/access";
import { TERMINAL_ASSET_BUCKET, TERMINAL_THEMES, isHexColor, isSafeTerminalAssetPath, isValidTerminalOverlay } from "@/lib/terminal/appearance";

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function normalizeReturnView(value: string) {
  return ["branch-queue", "branch-notifications", "branch-operating"].includes(value)
    ? value
    : "branch-queue";
}

function fail(branchId: string, message: string, returnView = "branch-queue"): never {
  const branch = branchId
    ? `&branch=${encodeURIComponent(branchId)}`
    : "";

  redirect(
    `/dashboard/settings?view=${encodeURIComponent(normalizeReturnView(returnView))}&error=${encodeURIComponent(message)}${branch}`,
  );
}

export async function updateQueueSettings(formData: FormData) {
  const branchId = field(formData, "branch_id");
  const startingNumber = Number(field(formData, "starting_number"));
  const noShowMinutes = Number(field(formData, "no_show_minutes"));
  const timezone = field(formData, "timezone");
  const customerRefreshSeconds = Number(field(formData, "customer_refresh_seconds") || 8);
  const smsStartPosition = Number(field(formData, "sms_start_position") || 3);
  const returnView = normalizeReturnView(field(formData, "return_view"));

  if (!branchId) fail(branchId, "Select a branch.", returnView);


  if (
    !Number.isInteger(startingNumber) ||
    startingNumber < 1 ||
    startingNumber > 999999
  ) {
    fail(branchId, "Starting number must be between 1 and 999999.", returnView);
  }

  if (
    !Number.isInteger(noShowMinutes) ||
    noShowMinutes < 0 ||
    noShowMinutes > 1440
  ) {
    fail(branchId, "No-show minutes must be between 0 and 1440.", returnView);
  }

  if (!Number.isInteger(customerRefreshSeconds) || customerRefreshSeconds < 3 || customerRefreshSeconds > 300) {
    fail(branchId, "Customer refresh interval must be between 3 and 300 seconds.", returnView);
  }

  if (!Number.isInteger(smsStartPosition) || smsStartPosition < 1 || smsStartPosition > 20) {
    fail(branchId, "SMS start position must be between 1 and 20.", returnView);
  }

  if (!(TIMEZONES as readonly string[]).includes(timezone)) {
    fail(branchId, "Choose a supported timezone.", returnView);
  }

  const hours = DAYS.map(({ value }) => {
    const isOpen = checked(formData, `day_${value}_open`);
    const openTime = field(formData, `day_${value}_open_time`);
    const closeTime = field(formData, `day_${value}_close_time`);

    if (
      isOpen &&
      (!/^\d{2}:\d{2}$/.test(openTime) ||
        !/^\d{2}:\d{2}$/.test(closeTime))
    ) {
      fail(branchId, "Every open day needs opening and closing times.", returnView);
    }

    if (isOpen && openTime >= closeTime) {
      fail(branchId, "Closing time must be later than opening time.", returnView);
    }

    return {
      day_of_week: value,
      is_open: isOpen,
      open_time: openTime,
      close_time: closeTime,
    };
  });

  const ruleCount = Number(field(formData, "position_rule_count") || 0);

  const rules = Array.from(
    { length: Math.max(0, Math.min(ruleCount, 20)) },
    (_, index) => ({
      position: Number(
        field(formData, `position_rule_${index}_position`),
      ),
      send_sms_once: checked(formData, `position_rule_${index}_sms`),
      browser_notification: checked(
        formData,
        `position_rule_${index}_browser`,
      ),
    }),
  ).filter(
    (rule) =>
      Number.isInteger(rule.position) &&
      rule.position >= 1,
  );

  if (
    new Set(rules.map((rule) => rule.position)).size !== rules.length
  ) {
    fail(branchId, "Each notification position must be unique.", returnView);
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect("/auth/login?next=%2Fdashboard%2Fsettings");
  }

  const { data: settingsMembership } = await supabase.from("business_users")
    .select("role,can_manage_operating_hours,can_view_queue_information_editing,can_view_position_notifications")
    .eq("user_id", userData.user.id).eq("is_active", true).limit(1).maybeSingle();
  const privileged = isOwnerOrAdmin(settingsMembership?.role);
  const permitted = privileged ||
    (returnView === "branch-operating" && Boolean(settingsMembership?.can_manage_operating_hours)) ||
    (returnView === "branch-queue" && Boolean(settingsMembership?.can_view_queue_information_editing)) ||
    (returnView === "branch-notifications" && Boolean(settingsMembership?.can_view_position_notifications));
  if (!permitted) fail(branchId, "You do not have permission to change these branch settings.", returnView);

  // Queue prefixes are managed at the service level. Settings no longer
  // exposes the branch fallback prefix, so preserve the current database
  // value instead of overwriting it during an unrelated settings save.
  const { data: currentConfig, error: currentConfigError } = await supabase
    .from("queue_configurations")
    .select("ticket_prefix")
    .eq("branch_id", branchId)
    .maybeSingle();

  if (currentConfigError) {
    fail(branchId, currentConfigError.message, returnView);
  }

  const ticketPrefix = currentConfig?.ticket_prefix || "Q";

  const { error } = await supabase.rpc("save_stub_queue_settings", {
    target_branch_id: branchId,
    target_ticket_prefix: ticketPrefix,
    target_starting_number: startingNumber,
    target_no_show_minutes: noShowMinutes,
    target_timezone: timezone,
    target_is_active: checked(formData, "is_active"),
    target_show_branch_contact: checked(formData, "show_branch_contact"),
    target_hours: hours,
    target_position_rules: rules,
  });

  if (error) {
    fail(branchId, error.message, returnView);
  }

  const { error: refreshError } = await supabase.rpc("set_customer_refresh_seconds", {
    target_branch_id: branchId,
    target_seconds: customerRefreshSeconds,
  });
  if (refreshError) fail(branchId, refreshError.message, returnView);

  const { error: smsSettingsError } = await supabase.rpc("set_branch_sms_position_settings", {
    target_branch_id: branchId,
    target_enabled: checked(formData, "sms_notifications_enabled"),
    target_start_position: smsStartPosition,
  });
  if (smsSettingsError) fail(branchId, smsSettingsError.message, returnView);

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/branches");

  // The unique saved token forces the Settings form to remount after the
  // redirect. That means the UI immediately shows the values read back from
  // the database instead of preserving stale uncontrolled input state.
  const savedToken = Date.now().toString();

  redirect(
    `/dashboard/settings?branch=${encodeURIComponent(
      branchId,
    )}&view=${encodeURIComponent(returnView)}&saved=${encodeURIComponent(
      savedToken,
    )}&message=${encodeURIComponent("Branch settings saved.")}`,
  );
}


export async function updateBusinessProfile(formData: FormData) {
  const businessName = field(formData, "business_name");
  if (businessName.length < 2 || businessName.length > 120) {
    redirect(`/dashboard/settings?view=business&error=${encodeURIComponent("Business name must be between 2 and 120 characters.")}`);
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/login?next=%2Fdashboard%2Fsettings");

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id,role")
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!membership || !isOwnerOrAdmin(membership.role)) {
    redirect(`/dashboard/settings?view=business&error=${encodeURIComponent("Only an owner or admin can edit the business profile.")}`);
  }

  const { error } = await supabase
    .from("businesses")
    .update({ name: businessName })
    .eq("id", membership.business_id);

  if (error) {
    redirect(`/dashboard/settings?view=business&error=${encodeURIComponent(error.message || "Unable to update business profile.")}`);
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  redirect(`/dashboard/settings?view=business&message=${encodeURIComponent("Business profile updated.")}`);
}

export async function updateTerminalAppearance(formData: FormData) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/login?next=%2Fdashboard%2Fsettings");

  const { data: membership } = await supabase.from("business_users")
    .select("business_id,role,businesses(terminal_background_image_url,terminal_logo_url)")
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!membership || !isOwnerOrAdmin(membership.role)) {
    redirect(`/dashboard/settings?view=branch-appearance&error=${encodeURIComponent("Only an owner or admin can change terminal appearance.")}#terminal-appearance`);
  }

  const branchId = field(formData, "branch_id");
  if (!branchId) redirect(`/dashboard/settings?view=branch-appearance&error=${encodeURIComponent("Choose a branch before saving terminal appearance.")}#terminal-appearance`);

  const { data: branch } = await supabase.from("branches")
    .select("id,terminal_background_image_url,terminal_logo_url")
    .eq("id", branchId)
    .eq("business_id", membership.business_id)
    .maybeSingle();
  if (!branch) redirect(`/dashboard/settings?view=branch-appearance&error=${encodeURIComponent("The selected branch is not available.")}#terminal-appearance`);

  const theme = field(formData, "terminal_theme");
  const pageColor = field(formData, "terminal_page_bg_color");
  const pressColor = field(formData, "terminal_press_bg_color");
  const accentColor = field(formData, "terminal_accent_color");
  const textColor = field(formData, "terminal_text_color");
  const mutedColor = field(formData, "terminal_muted_text_color");
  const overlay = Number(field(formData, "terminal_background_overlay") || "18");

  if (!(theme in TERMINAL_THEMES)) redirect(`/dashboard/settings?branch=${encodeURIComponent(branchId)}&view=branch-appearance&error=${encodeURIComponent("Invalid terminal theme.")}#terminal-appearance`);
  if (![pageColor, pressColor, accentColor, textColor, mutedColor].every((color) => isHexColor(color))) {
    redirect(`/dashboard/settings?branch=${encodeURIComponent(branchId)}&view=branch-appearance&error=${encodeURIComponent("Terminal colors must be valid 6-digit hex colors.")}#terminal-appearance`);
  }
  if (!isValidTerminalOverlay(overlay)) {
    redirect(`/dashboard/settings?branch=${encodeURIComponent(branchId)}&view=branch-appearance&error=${encodeURIComponent("Background overlay must be between 0 and 90.")}#terminal-appearance`);
  }

  const businessId = membership.business_id;
  const business = Array.isArray(membership.businesses) ? membership.businesses[0] : membership.businesses;
  let logoUrl = branch.terminal_logo_url ?? (business as { terminal_logo_url?: string | null } | null)?.terminal_logo_url ?? null;
  let backgroundUrl = branch.terminal_background_image_url ?? (business as { terminal_background_image_url?: string | null } | null)?.terminal_background_image_url ?? null;

  if (field(formData, "remove_terminal_logo") === "1") logoUrl = "";
  if (field(formData, "remove_terminal_background") === "1") backgroundUrl = "";

  const logoPath = field(formData, "terminal_logo_path");
  const backgroundPath = field(formData, "terminal_background_path");

  function publicAssetUrl(path: string, kind: "logo" | "background") {
    if (!path) return null;
    if (!isSafeTerminalAssetPath(path, businessId, kind)) {
      redirect(`/dashboard/settings?branch=${encodeURIComponent(branchId)}&view=branch-appearance&error=${encodeURIComponent("Invalid terminal image path.")}#terminal-appearance`);
    }
    return supabase.storage.from(TERMINAL_ASSET_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  logoUrl = publicAssetUrl(logoPath, "logo") ?? logoUrl;
  backgroundUrl = publicAssetUrl(backgroundPath, "background") ?? backgroundUrl;

  const appearance = {
    terminal_theme: theme,
    terminal_page_bg_color: pageColor,
    terminal_press_bg_color: pressColor,
    terminal_accent_color: accentColor,
    terminal_text_color: textColor,
    terminal_muted_text_color: mutedColor,
    terminal_background_overlay: overlay,
    terminal_logo_url: logoUrl,
    terminal_background_image_url: backgroundUrl,
  };

  const applyToAll = field(formData, "apply_to_all_branches") === "1";
  let appearanceUpdate = supabase.from("branches").update(appearance).eq("business_id", businessId);
  if (!applyToAll) appearanceUpdate = appearanceUpdate.eq("id", branchId);
  const { error } = await appearanceUpdate;
  if (error) redirect(`/dashboard/settings?branch=${encodeURIComponent(branchId)}&view=branch-appearance&error=${encodeURIComponent(error.message)}#terminal-appearance`);

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/terminals");
  revalidatePath("/kiosk/[deviceToken]", "page");
  redirect(`/dashboard/settings?branch=${encodeURIComponent(branchId)}&view=branch-appearance&message=${encodeURIComponent(applyToAll ? "Terminal appearance applied to all branches." : "Branch terminal appearance updated.")}#terminal-appearance`);
}

function serviceSettingsUrl(key: "message" | "error", message: string, branchId?: string, view = "services") {
  const params = new URLSearchParams({ view, [key]: message });
  if (branchId) params.set("branch", branchId);
  return `/dashboard/settings?${params.toString()}`;
}

async function serviceCatalogContext() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/auth/login?next=%2Fdashboard%2Fsettings");
  const { data: membership } = await supabase.from("business_users")
    .select("business_id,role,can_manage_services,is_active")
    .eq("user_id", auth.user.id).eq("is_active", true).limit(1).maybeSingle();
  if (!membership || (!isOwnerOrAdmin(membership.role) && !membership.can_manage_services)) {
    redirect(serviceSettingsUrl("error", "You do not have permission to manage services."));
  }
  const { data: branches } = await supabase.from("branches").select("id").eq("business_id", membership.business_id);
  return { supabase, membership, branchIds: (branches ?? []).map((row) => row.id) };
}

function validateCatalogService(formData: FormData) {
  const name = field(formData, "name");
  const description = field(formData, "description");
  const queuePrefix = field(formData, "queue_prefix").toUpperCase();
  const serviceGroup = field(formData, "service_group");
  const estimatedRaw = field(formData, "estimated_minutes");
  const estimatedMinutes = estimatedRaw ? Number(estimatedRaw) : null;
  if (name.length < 2 || name.length > 120) redirect(serviceSettingsUrl("error", "Service name must be between 2 and 120 characters."));
  if (description.length > 500) redirect(serviceSettingsUrl("error", "Description must be 500 characters or fewer."));
  if (queuePrefix && !/^[A-Z0-9]{1,6}$/.test(queuePrefix)) redirect(serviceSettingsUrl("error", "Queue prefix must be 1-6 letters or numbers."));
  if (estimatedMinutes !== null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 480)) redirect(serviceSettingsUrl("error", "Estimated minutes must be a whole number from 1 to 480."));
  return { name, serviceGroup: serviceGroup || null, description: description || null, queuePrefix: queuePrefix || null, estimatedMinutes };
}

export async function createCatalogService(formData: FormData) {
  const payload = validateCatalogService(formData);
  const { supabase, membership } = await serviceCatalogContext();
  const { error } = await supabase.from("business_services").insert({
    business_id: membership.business_id, name: payload.name, service_group: payload.serviceGroup,
    description: payload.description, queue_prefix: payload.queuePrefix, estimated_minutes: payload.estimatedMinutes,
  });
  if (error) redirect(serviceSettingsUrl("error", error.code === "23505" ? "A service with this name already exists." : error.message));
  revalidatePath("/dashboard/settings");
  redirect(serviceSettingsUrl("message", "Service added to the business service library."));
}

export async function updateCatalogService(formData: FormData) {
  const serviceId = field(formData, "service_key");
  const payload = validateCatalogService(formData);
  const { supabase, membership } = await serviceCatalogContext();
  const { error } = await supabase.from("business_services").update({
    name: payload.name, service_group: payload.serviceGroup, description: payload.description,
    queue_prefix: payload.queuePrefix, estimated_minutes: payload.estimatedMinutes, updated_at: new Date().toISOString(),
  }).eq("id", serviceId).eq("business_id", membership.business_id);
  if (error) redirect(serviceSettingsUrl("error", error.message));
  const { data: links } = await supabase.from("branch_service_catalog").select("service_id").eq("business_service_id", serviceId).not("service_id", "is", null);
  for (const link of links ?? []) if (link.service_id) await supabase.from("services").update({ name: payload.name, description: payload.description, queue_prefix: payload.queuePrefix, estimated_minutes: payload.estimatedMinutes }).eq("id", link.service_id);
  revalidatePath("/dashboard/settings");
  redirect(serviceSettingsUrl("message", "Service updated."));
}

export async function deleteCatalogService(formData: FormData) {
  const serviceId = field(formData, "service_key");
  const { supabase, membership } = await serviceCatalogContext();
  const { data: links } = await supabase.from("branch_service_catalog").select("branch_id,service_id").eq("business_service_id", serviceId);
  const assigned = (links ?? []).filter((link): link is { branch_id: string; service_id: string } => Boolean(link.branch_id && link.service_id));
  const ids = assigned.map((link) => link.service_id);
  if (ids.length) {
    const { count, error: historyError } = await supabase.from("tickets").select("id", { count:"exact", head:true }).in("service_id", ids);
    if (historyError) redirect(serviceSettingsUrl("error", historyError.message));
    if ((count ?? 0) > 0) redirect(serviceSettingsUrl("error", "This service has queue history and cannot be deleted."));

    // A library service owns the operational branch-service rows created from it.
    // When there is no queue history, remove those rows first through the existing
    // audited deletion RPC so deleting the catalog item cannot leave orphaned,
    // still-active services visible in branch queues.
    for (const link of assigned) {
      const { error: serviceError } = await supabase.rpc("delete_service_for_branch", {
        target_service_id: link.service_id,
        target_branch_id: link.branch_id,
      });
      if (serviceError) redirect(serviceSettingsUrl("error", serviceError.message));
    }
  }
  const { error } = await supabase.from("business_services").delete().eq("id", serviceId).eq("business_id", membership.business_id);
  if (error) redirect(serviceSettingsUrl("error", error.message));
  revalidatePath("/dashboard/settings");
  redirect(serviceSettingsUrl("message", "Service deleted from the library."));
}

export async function assignCatalogServiceToBranch(formData: FormData) {
  const branchId = field(formData, "branch_id");
  const serviceId = field(formData, "service_key");
  const mode = field(formData, "mode");
  const { supabase, membership, branchIds } = await serviceCatalogContext();
  if (!branchId || !branchIds.includes(branchId)) redirect(serviceSettingsUrl("error", "Invalid branch.", branchId, "branch-services"));
  const { data: catalog } = await supabase.from("business_services").select("id,name,description,queue_prefix,estimated_minutes").eq("id", serviceId).eq("business_id", membership.business_id).maybeSingle();
  if (!catalog) redirect(serviceSettingsUrl("error", "Service was not found in the library.", branchId, "branch-services"));
  const { data: link } = await supabase.from("branch_service_catalog").select("service_id").eq("business_service_id", serviceId).eq("branch_id", branchId).maybeSingle();
  if (mode === "remove") {
    if (link?.service_id) await supabase.rpc("set_service_active", { target_service_id: link.service_id, target_is_active: false });
    await supabase.from("branch_service_catalog").delete().eq("business_service_id", serviceId).eq("branch_id", branchId);
    revalidatePath("/dashboard/settings");
    redirect(serviceSettingsUrl("message", "Service removed from this branch.", branchId, "branch-services"));
  }
  let operationalId = link?.service_id ?? null;
  if (!operationalId) {
    const { data: existing } = await supabase.from("services").select("id").eq("branch_id", branchId).ilike("name", catalog.name).maybeSingle();
    operationalId = existing?.id ?? null;
    if (!operationalId) {
      const { error } = await supabase.rpc("create_service_for_branch", { target_branch_id: branchId, service_name: catalog.name, service_description: catalog.description, service_queue_prefix: catalog.queue_prefix, service_estimated_minutes: catalog.estimated_minutes });
      if (error) redirect(serviceSettingsUrl("error", error.message, branchId, "branch-services"));
      const { data: row } = await supabase.from("services").select("id").eq("branch_id",branchId).ilike("name",catalog.name).maybeSingle();
      operationalId = row?.id ?? null;
    } else await supabase.rpc("set_service_active", { target_service_id: operationalId, target_is_active:true });
  }
  const { error: linkError } = await supabase.from("branch_service_catalog").upsert({ business_service_id: serviceId, branch_id: branchId, service_id: operationalId }, { onConflict:"business_service_id,branch_id" });
  if (linkError) redirect(serviceSettingsUrl("error", linkError.message, branchId, "branch-services"));
  revalidatePath("/dashboard/settings");
  redirect(serviceSettingsUrl("message", "Service added to this branch.", branchId, "branch-services"));
}
