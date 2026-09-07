export type BusinessRole = "owner" | "admin" | "manager" | "staff";

export type AccessMembership = {
  role?: string | null;
  can_view_queue_information_editing?: boolean | null;
  can_view_position_notifications?: boolean | null;
  can_manage_operating_hours?: boolean | null;
  can_manage_kiosk_display?: boolean | null;
  can_view_reports?: boolean | null;
  can_manage_team?: boolean | null;
  can_manage_services?: boolean | null;
  can_set_branch_status?: boolean | null;
};

export type DashboardAccess = {
  role: BusinessRole | null;
  canViewSettings: boolean;
  canViewReports: boolean;
  canManageTeam: boolean;
  canManageServices: boolean;
  canManageBranches: boolean;
};

const BUSINESS_ROLES = new Set<BusinessRole>(["owner", "admin", "manager", "staff"]);

export function asBusinessRole(value?: string | null): BusinessRole | null {
  return value && BUSINESS_ROLES.has(value as BusinessRole) ? value as BusinessRole : null;
}

export function isOwnerOrAdmin(role?: string | null): boolean {
  return role === "owner" || role === "admin";
}

export function dashboardAccessFor(membership?: AccessMembership | null): DashboardAccess {
  const role = asBusinessRole(membership?.role);
  if (!membership || !role) {
    return { role: null, canViewSettings: false, canViewReports: false, canManageTeam: false, canManageServices: false, canManageBranches: false };
  }

  if (isOwnerOrAdmin(role)) {
    return { role, canViewSettings: true, canViewReports: true, canManageTeam: true, canManageServices: true, canManageBranches: true };
  }

  return {
    role,
    canViewReports: Boolean(membership.can_view_reports),
    canManageTeam: Boolean(membership.can_manage_team),
    canManageServices: Boolean(membership.can_manage_services),
    canManageBranches: Boolean(
      membership.can_set_branch_status || membership.can_manage_operating_hours || membership.can_manage_kiosk_display,
    ),
    canViewSettings: Boolean(
      membership.can_view_queue_information_editing ||
      membership.can_view_position_notifications ||
      membership.can_manage_operating_hours ||
      membership.can_manage_kiosk_display,
    ),
  };
}
