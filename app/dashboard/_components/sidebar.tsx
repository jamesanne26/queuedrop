"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/auth/actions";

type NavKey = "overview" | "queues" | "reports" | "tv" | "settings";

type Props = {
  active?: NavKey;
  role?: "owner" | "admin" | "manager" | "staff" | null;
  canViewQueue?: boolean;
  canViewSettings?: boolean;
  canViewReports?: boolean;
  canManageTeam?: boolean;
  canManageServices?: boolean;
  canManageBranches?: boolean;
};

export function DashboardSidebar({ active, role = "owner", canViewQueue, canViewSettings, canViewReports }: Props) {
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

  const queueVisible = canViewQueue ?? (role === "owner" || role === "admin" || role === "manager" || role === "staff");
  const settingsVisible = canViewSettings ?? (role === "owner" || role === "admin" || role === "manager");
  const reportsVisible = canViewReports ?? (role === "owner" || role === "admin");

  const nav = (
    <>
      <Link className={`nav-item ${currentActive === "overview" ? "nav-item-active" : ""}`} href="/dashboard" onClick={() => setOpen(false)}>Overview</Link>
      {queueVisible ? <><Link className={`nav-item ${currentActive === "queues" ? "nav-item-active" : ""}`} href="/dashboard/queues" onClick={() => setOpen(false)}>Queue</Link><Link className={`nav-item ${currentActive === "tv" ? "nav-item-active" : ""}`} href="/dashboard/tv" onClick={() => setOpen(false)}>TV Display</Link></> : null}
      {reportsVisible ? <Link className={`nav-item ${currentActive === "reports" ? "nav-item-active" : ""}`} href="/dashboard/reports" onClick={() => setOpen(false)}>History</Link> : null}
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
        <div className="sidebar-footer sidebar-footer-account-settings">
          <div className="sidebar-bottom-nav-row sidebar-bottom-nav-row-single">
            {settingsVisible ? <Link className={`nav-item sidebar-bottom-nav-item ${currentActive === "settings" ? "nav-item-active" : ""}`} href="/dashboard/settings" onClick={() => setOpen(false)}>Settings</Link> : null}
          </div>
          <a className="nav-item sidebar-bottom-nav-item" href={`/api/support/start?from=${encodeURIComponent(pathname)}`} onClick={() => setOpen(false)}>Support</a>
          <details className="sidebar-account-menu">
            <summary className="nav-item sidebar-account-trigger">Account <span>⌃</span></summary>
            <div className="sidebar-account-popover">
              <Link className="nav-item" href="/dashboard/account" onClick={() => setOpen(false)}>My Account</Link>
              <form action={signOut} data-no-global-loading="true">
                <button className="nav-item sidebar-signout-button" type="submit">Sign out</button>
              </form>
            </div>
          </details>
        </div>
      </aside>
    </>
  );
}
