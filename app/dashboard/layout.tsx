import type { ReactNode } from "react";
import { DashboardFrame } from "@/app/dashboard/_components/dashboard-frame";
import { createClient } from "@/lib/supabase/server";
import { dashboardAccessFor } from "@/lib/auth/access";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  let access = dashboardAccessFor(null);

  if (userData.user) {
    const { data: membership } = await supabase
      .from("business_users")
      .select("role, can_view_queue_information_editing, can_view_position_notifications, can_manage_operating_hours, can_manage_kiosk_display, can_view_reports, can_manage_team, can_manage_services, can_set_branch_status")
      .eq("user_id", userData.user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    access = dashboardAccessFor(membership);
  }

  return <DashboardFrame role={access.role} canViewSettings={access.canViewSettings} canViewReports={access.canViewReports} canManageTeam={access.canManageTeam} canManageServices={access.canManageServices} canManageBranches={access.canManageBranches}>{children}</DashboardFrame>;
}
