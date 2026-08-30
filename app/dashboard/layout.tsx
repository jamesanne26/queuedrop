import type { ReactNode } from "react";
import { DashboardFrame } from "@/app/dashboard/_components/dashboard-frame";
import { createClient } from "@/lib/supabase/server";

type Role = "owner" | "admin" | "manager" | "staff";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  let role: Role | null = null;
  let canViewSettings = false;
  let canViewReports = false;
  let canManageTeam = false;
  let canManageServices = false;
  let canManageBranches = false;

  if (userData.user) {
    const { data: currentRole, error: roleError } = await supabase.rpc(
      "get_current_business_role",
    );

    if (!roleError && currentRole) {
      role = currentRole as Role;
    } else {
      const { data: membership } = await supabase
        .from("business_users")
        .select("role")
        .eq("user_id", userData.user.id)
        .limit(1)
        .maybeSingle();

      role = (membership?.role as Role | undefined) ?? null;
    }

    if (role === "owner" || role === "admin") {
      canViewSettings = true;
      canViewReports = true;
      canManageTeam = true;
      canManageServices = true;
      canManageBranches = true;
    } else if (role === "manager" || role === "staff") {
      const { data: permission } = await supabase
        .from("business_users")
        .select("can_view_queue_information_editing, can_view_position_notifications, can_manage_operating_hours, can_manage_kiosk_display, can_view_reports, can_manage_team, can_manage_services, can_set_branch_status")
        .eq("user_id", userData.user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      canViewReports = Boolean(permission?.can_view_reports);
      canManageTeam = Boolean(permission?.can_manage_team);
      canManageServices = Boolean(permission?.can_manage_services);
      canManageBranches = Boolean(permission?.can_set_branch_status || permission?.can_manage_operating_hours || permission?.can_manage_kiosk_display);
      canViewSettings = Boolean(
        permission?.can_view_queue_information_editing ||
          permission?.can_view_position_notifications ||
          permission?.can_manage_operating_hours ||
          permission?.can_manage_kiosk_display,
      );
    }
  }

  return <DashboardFrame role={role} canViewSettings={canViewSettings} canViewReports={canViewReports} canManageTeam={canManageTeam} canManageServices={canManageServices} canManageBranches={canManageBranches}>{children}</DashboardFrame>;
}
