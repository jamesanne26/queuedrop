"use client";

import { usePathname } from "next/navigation";
import { DashboardSidebar } from "./sidebar";

type Role = "owner" | "admin" | "manager" | "staff";

type Props = {
  role: Role | null;
  canViewSettings: boolean;
  canViewReports: boolean;
  canManageTeam: boolean;
  canManageServices: boolean;
  canManageBranches: boolean;
  children: React.ReactNode;
};

export function DashboardFrame({ role, canViewSettings, canViewReports, canManageTeam, canManageServices, canManageBranches, children }: Props) {
  const pathname = usePathname();
  const liveQueue = pathname === "/dashboard/queues";

  if (liveQueue) return <>{children}</>;

  return (
    <main className="dashboard-shell">
      <DashboardSidebar role={role} canViewSettings={canViewSettings} canViewReports={canViewReports} canManageTeam={canManageTeam} canManageServices={canManageServices} canManageBranches={canManageBranches} />
      <div className="dashboard-route-content">{children}</div>
    </main>
  );
}
