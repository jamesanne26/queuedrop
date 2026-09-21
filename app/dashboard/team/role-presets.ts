export const STAFF_RECOMMENDED_PERMISSIONS = [
  "view_live_queue",
  "add_customer",
  "edit_customer",
  "call_next_customer",
  "return_last_customer",
  "move_to_serving",
  "move_to_pending",
  "complete_customer",
  "mark_no_show",
] as const;

export const MANAGER_RECOMMENDED_PERMISSIONS = [
  "view_live_queue",
  "add_customer",
  "edit_customer",
  "cancel_customer",
  "call_next_customer",
  "return_last_customer",
  "move_to_serving",
  "move_to_pending",
  "complete_customer",
  "mark_no_show",
  "view_customer_contact",
  "view_history",
  "view_reports",
  "export_reports",
  "manage_services",
  "manage_employees",
  "manage_branches",
  "manage_settings",
  "manage_kiosk_display",
  "manage_operating_hours",
  "manage_position_notifications",
  "manage_queue_information",
] as const;

export type RecommendedRolePreset = "staff" | "manager";

export function recommendedPermissionsForRole(preset: RecommendedRolePreset) {
  return preset === "manager"
    ? [...MANAGER_RECOMMENDED_PERMISSIONS]
    : [...STAFF_RECOMMENDED_PERMISSIONS];
}

export function recommendedBranchScopeForRole(preset: RecommendedRolePreset) {
  return preset === "manager" ? "selected_branches" : "own_branch_only";
}
