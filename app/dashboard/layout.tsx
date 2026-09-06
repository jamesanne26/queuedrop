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
    const { data: membership } = await supabase
      .from("business_users")
      .select("role, can_view_queue_information_editing, can_view_position_notifications, can_manage_operating_hours, can_manage_kiosk_display, can_view_reports, can_manage_team, can_manage_services, can_set_branch_status")
      .eq("user_id", userData.user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    role = (membership?.role as Role | undefined) ?? null;

    if (role === "owner" || role === "admin") {
      canViewSettings = true;
      canViewReports = true;
      canManageTeam = true;
      canManageServices = true;
      canManageBranches = true;
    } else if (membership && (role === "manager" || role === "staff")) {
      canViewReports = Boolean(membership.can_view_reports);
      canManageTeam = Boolean(membership.can_manage_team);
      canManageServices = Boolean(membership.can_manage_services);
      canManageBranches = Boolean(membership.can_set_branch_status || membership.can_manage_operating_hours || membership.can_manage_kiosk_display);
      canViewSettings = Boolean(
        membership.can_view_queue_information_editing ||
          membership.can_view_position_notifications ||
          membership.can_manage_operating_hours ||
          membership.can_manage_kiosk_display,
      );
    }
  }

  return <DashboardFrame role={role} canViewSettings={canViewSettings} canViewReports={canViewReports} canManageTeam={canManageTeam} canManageServices={canManageServices} canManageBranches={canManageBranches}>{children}</DashboardFrame>;
}
