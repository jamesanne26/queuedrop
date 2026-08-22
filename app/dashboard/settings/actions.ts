"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DAYS, TIMEZONES } from "./constants";

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
  const ticketPrefix = field(formData, "ticket_prefix").toUpperCase();
  const startingNumber = Number(field(formData, "starting_number"));
  const noShowMinutes = Number(field(formData, "no_show_minutes"));
  const timezone = field(formData, "timezone");

  if (!branchId) fail(branchId, "Select a branch.");

  if (!/^[A-Z0-9]{1,6}$/.test(ticketPrefix)) {
    fail(branchId, "Queue prefix must be 1 to 6 letters or numbers.");
  }

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

  const { error } = await supabase.rpc("save_branch_queue_settings", {
    target_branch_id: branchId,
    target_ticket_prefix: ticketPrefix,
    target_starting_number: startingNumber,
    target_no_show_minutes: noShowMinutes,
    target_timezone: timezone,
    target_allow_qr_join: checked(formData, "allow_qr_join"),
    target_is_active: checked(formData, "is_active"),
    target_show_branch_contact: checked(
      formData,
      "show_branch_contact",
    ),
    target_customer_can_edit_name: checked(
      formData,
      "customer_can_edit_name",
    ),
    target_customer_can_edit_mobile: checked(
      formData,
      "customer_can_edit_mobile",
    ),
    target_staff_can_edit_name: checked(
      formData,
      "staff_can_edit_name",
    ),
    target_staff_can_edit_mobile: checked(
      formData,
      "staff_can_edit_mobile",
    ),
    target_manager_can_edit_name: checked(
      formData,
      "manager_can_edit_name",
    ),
    target_manager_can_edit_mobile: checked(
      formData,
      "manager_can_edit_mobile",
    ),
    target_hours: hours,
    target_position_rules: rules,
  });

  if (error) {
    fail(branchId, error.message);
  }

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
