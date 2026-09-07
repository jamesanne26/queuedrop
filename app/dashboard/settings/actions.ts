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

function fail(branchId: string, message: string): never {
  const branch = branchId
    ? `&branch=${encodeURIComponent(branchId)}`
    : "";

  redirect(
    `/dashboard/settings?error=${encodeURIComponent(message)}${branch}`,
  );
}

export async function updateQueueSettings(formData: FormData) {
  const branchId = field(formData, "branch_id");
  const startingNumber = Number(field(formData, "starting_number"));
  const noShowMinutes = Number(field(formData, "no_show_minutes"));
  const timezone = field(formData, "timezone");
  const customerRefreshSeconds = Number(field(formData, "customer_refresh_seconds") || 8);
  const smsStartPosition = Number(field(formData, "sms_start_position") || 3);

  if (!branchId) fail(branchId, "Select a branch.");


  if (
    !Number.isInteger(startingNumber) ||
    startingNumber < 1 ||
    startingNumber > 999999
  ) {
    fail(branchId, "Starting number must be between 1 and 999999.");
  }

  if (
    !Number.isInteger(noShowMinutes) ||
    noShowMinutes < 0 ||
    noShowMinutes > 1440
  ) {
    fail(branchId, "No-show minutes must be between 0 and 1440.");
  }

  if (!Number.isInteger(customerRefreshSeconds) || customerRefreshSeconds < 3 || customerRefreshSeconds > 300) {
    fail(branchId, "Customer refresh interval must be between 3 and 300 seconds.");
  }

  if (!Number.isInteger(smsStartPosition) || smsStartPosition < 1 || smsStartPosition > 20) {
    fail(branchId, "SMS start position must be between 1 and 20.");
  }

  if (!(TIMEZONES as readonly string[]).includes(timezone)) {
    fail(branchId, "Choose a supported timezone.");
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
      fail(branchId, "Every open day needs opening and closing times.");
    }

    if (isOpen && openTime >= closeTime) {
      fail(branchId, "Closing time must be later than opening time.");
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
    fail(branchId, "Each notification position must be unique.");
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect("/auth/login?next=%2Fdashboard%2Fsettings");
  }

  // Queue prefixes are managed at the service level. Settings no longer
  // exposes the branch fallback prefix, so preserve the current database
  // value instead of overwriting it during an unrelated settings save.
  const { data: currentConfig, error: currentConfigError } = await supabase
    .from("queue_configurations")
    .select("ticket_prefix")
    .eq("branch_id", branchId)
    .maybeSingle();

  if (currentConfigError) {
    fail(branchId, currentConfigError.message);
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
    fail(branchId, error.message);
  }

  const { error: refreshError } = await supabase.rpc("set_customer_refresh_seconds", {
    target_branch_id: branchId,
    target_seconds: customerRefreshSeconds,
  });
  if (refreshError) fail(branchId, refreshError.message);

  const { error: smsSettingsError } = await supabase.rpc("set_branch_sms_position_settings", {
    target_branch_id: branchId,
    target_enabled: checked(formData, "sms_notifications_enabled"),
    target_start_position: smsStartPosition,
  });
  if (smsSettingsError) fail(branchId, smsSettingsError.message);

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/branches");

  // The unique saved token forces the Settings form to remount after the
  // redirect. That means the UI immediately shows the values read back from
  // the database instead of preserving stale uncontrolled input state.
  const savedToken = Date.now().toString();

  redirect(
    `/dashboard/settings?branch=${encodeURIComponent(
      branchId,
    )}&saved=${encodeURIComponent(
      savedToken,
    )}&message=${encodeURIComponent("Branch settings saved.")}`,
  );
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
    redirect(`/dashboard/settings?error=${encodeURIComponent("Only an owner or admin can change terminal appearance.")}#terminal-appearance`);
  }

  const theme = field(formData, "terminal_theme");
  const pageColor = field(formData, "terminal_page_bg_color");
  const pressColor = field(formData, "terminal_press_bg_color");
  const accentColor = field(formData, "terminal_accent_color");
  const textColor = field(formData, "terminal_text_color");
  const mutedColor = field(formData, "terminal_muted_text_color");
  const overlay = Number(field(formData, "terminal_background_overlay") || "18");

  if (!(theme in TERMINAL_THEMES)) redirect(`/dashboard/settings?error=${encodeURIComponent("Invalid terminal theme.")}#terminal-appearance`);
  if (![pageColor, pressColor, accentColor, textColor, mutedColor].every((color) => isHexColor(color))) {
    redirect(`/dashboard/settings?error=${encodeURIComponent("Terminal colors must be valid 6-digit hex colors.")}#terminal-appearance`);
  }
  if (!isValidTerminalOverlay(overlay)) {
    redirect(`/dashboard/settings?error=${encodeURIComponent("Background overlay must be between 0 and 90.")}#terminal-appearance`);
  }

  const businessId = membership.business_id;
  const business = Array.isArray(membership.businesses) ? membership.businesses[0] : membership.businesses;
  let logoUrl = (business as { terminal_logo_url?: string | null } | null)?.terminal_logo_url ?? null;
  let backgroundUrl = (business as { terminal_background_image_url?: string | null } | null)?.terminal_background_image_url ?? null;

  if (field(formData, "remove_terminal_logo") === "1") logoUrl = null;
  if (field(formData, "remove_terminal_background") === "1") backgroundUrl = null;

  const logoPath = field(formData, "terminal_logo_path");
  const backgroundPath = field(formData, "terminal_background_path");

  function publicAssetUrl(path: string, kind: "logo" | "background") {
    if (!path) return null;
    if (!isSafeTerminalAssetPath(path, businessId, kind)) {
      redirect(`/dashboard/settings?error=${encodeURIComponent("Invalid terminal image path.")}#terminal-appearance`);
    }
    return supabase.storage.from(TERMINAL_ASSET_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  logoUrl = publicAssetUrl(logoPath, "logo") ?? logoUrl;
  backgroundUrl = publicAssetUrl(backgroundPath, "background") ?? backgroundUrl;

  const { error } = await supabase.from("businesses").update({
    terminal_theme: theme,
    terminal_page_bg_color: pageColor,
    terminal_press_bg_color: pressColor,
    terminal_accent_color: accentColor,
    terminal_text_color: textColor,
    terminal_muted_text_color: mutedColor,
    terminal_background_overlay: overlay,
    terminal_logo_url: logoUrl,
    terminal_background_image_url: backgroundUrl,
  }).eq("id", membership.business_id);

  if (error) redirect(`/dashboard/settings?error=${encodeURIComponent(error.message)}#terminal-appearance`);
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/terminals");
  redirect(`/dashboard/settings?message=${encodeURIComponent("Terminal appearance updated.")}#terminal-appearance`);
}
