"use client";

import { usePathname } from "next/navigation";
import { DashboardSidebar } from "./sidebar";

type Role = "owner" | "admin" | "manager" | "staff";

type Props = {
  role: Role | null;
  canViewQueue: boolean;
  canViewSettings: boolean;
  canViewReports: boolean;
  canManageTeam: boolean;
  canManageServices: boolean;
  canManageBranches: boolean;
  children: React.ReactNode;
};

export function DashboardFrame({ role, canViewQueue, canViewSettings, canViewReports, canManageTeam, canManageServices, canManageBranches, children }: Props) {
  const pathname = usePathname();
  const fullScreenRoute = pathname === "/dashboard/queues" || pathname === "/dashboard/tv";

  if (fullScreenRoute) return <>{children}</>;

  return (
    <main className="dashboard-shell">
      <DashboardSidebar role={role} canViewQueue={canViewQueue} canViewSettings={canViewSettings} canViewReports={canViewReports} canManageTeam={canManageTeam} canManageServices={canManageServices} canManageBranches={canManageBranches} />
      <div className="dashboard-route-content">{children}</div>
    </main>
  );
}
