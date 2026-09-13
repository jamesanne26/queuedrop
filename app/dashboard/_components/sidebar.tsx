"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/auth/actions";

type NavKey = "overview" | "queues" | "reports" | "tv" | "settings";

type Props = {
  active?: NavKey;
  role?: "owner" | "admin" | "manager" | "staff" | null;
  canViewSettings?: boolean;
  canViewReports?: boolean;
  canManageTeam?: boolean;
  canManageServices?: boolean;
  canManageBranches?: boolean;
};

export function DashboardSidebar({ active, role = "owner", canViewSettings, canViewReports }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const settingsArea = pathname.startsWith("/dashboard/settings")
    || pathname.startsWith("/dashboard/branches")
    || pathname.startsWith("/dashboard/services")
    || pathname.startsWith("/dashboard/team")
    || pathname.startsWith("/dashboard/terminals");

  const routeActive: NavKey = pathname.startsWith("/dashboard/reports")
    ? "reports"
    : pathname.startsWith("/dashboard/tv")
      ? "tv"
      : pathname.startsWith("/dashboard/queues")
        ? "queues"
        : settingsArea
          ? "settings"
          : "overview";
  const currentActive = active ?? routeActive;

  const settingsVisible = canViewSettings ?? (role === "owner" || role === "admin" || role === "manager");
  const reportsVisible = canViewReports ?? (role === "owner" || role === "admin");

  const nav = (
    <>
      <Link className={`nav-item ${currentActive === "overview" ? "nav-item-active" : ""}`} href="/dashboard" onClick={() => setOpen(false)}>Overview</Link>
      <Link className={`nav-item nav-item-queues-primary ${currentActive === "queues" ? "nav-item-active" : ""}`} href="/dashboard/queues" onClick={() => setOpen(false)}><span>Queues</span><span className="nav-item-queues-indicator" aria-hidden="true">→</span></Link>
      {reportsVisible ? <Link className={`nav-item ${currentActive === "reports" ? "nav-item-active" : ""}`} href="/dashboard/reports" onClick={() => setOpen(false)}>History & Reports</Link> : null}
      <Link className={`nav-item ${currentActive === "tv" ? "nav-item-active" : ""}`} href="/dashboard/tv" onClick={() => setOpen(false)}>TV Queue Display</Link>
      {settingsVisible ? <Link className={`nav-item ${currentActive === "settings" ? "nav-item-active" : ""}`} href="/dashboard/settings" onClick={() => setOpen(false)}>Settings</Link> : null}
    </>
  );

  return (
    <>
      <header className="dashboard-mobile-bar">
        <Link href="/dashboard" className="brand-mark brand-light" onClick={() => setOpen(false)}>QueueDrop</Link>
        <button type="button" className="dashboard-menu-button" aria-label="Open navigation menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <span /><span /><span />
        </button>
      </header>

      {open ? <button type="button" className="sidebar-backdrop" aria-label="Close navigation menu" onClick={() => setOpen(false)} /> : null}

      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-mobile-heading">
          <Link href="/dashboard" className="brand-mark brand-light" onClick={() => setOpen(false)}>QueueDrop</Link>
          <button type="button" className="sidebar-close-button" aria-label="Close navigation menu" onClick={() => setOpen(false)}>×</button>
        </div>
        <Link href="/dashboard" className="brand-mark brand-light sidebar-desktop-brand">QueueDrop</Link>
        <nav>{nav}</nav>
        <div className="sidebar-footer">
          <form action={signOut} data-no-global-loading="true">
            <button className="nav-item sidebar-signout-button" type="submit">Sign out</button>
          </form>
        </div>
      </aside>
    </>
  );
}
