"use client";

import { usePathname } from "next/navigation";
import { DashboardSidebar } from "./sidebar";

type Role = "owner" | "admin" | "manager" | "staff";

type Props = {
  role: Role | null;
  children: React.ReactNode;
};

export function DashboardFrame({ role, children }: Props) {
  const pathname = usePathname();
  const liveQueue = pathname === "/dashboard/queues";

  if (liveQueue) return <>{children}</>;

  return (
    <main className="dashboard-shell">
      <DashboardSidebar role={role} />
      <div className="dashboard-route-content">{children}</div>
    </main>
  );
}
