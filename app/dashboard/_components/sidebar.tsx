"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/auth/actions";

type NavKey = "overview" | "branches" | "services" | "queues" | "terminals" | "team" | "reports" | "settings" | "getStub" | "getQueue";

type Props = {
  active?: NavKey;
  role?: "owner" | "admin" | "manager" | "staff" | null;
  canViewSettings?: boolean;
  canViewReports?: boolean;
  canManageTeam?: boolean;
  canManageServices?: boolean;
  canManageBranches?: boolean;
};

export function DashboardSidebar({ active, role = "owner", canViewSettings, canViewReports, canManageTeam, canManageServices, canManageBranches }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const routeActive: NavKey = pathname.startsWith("/dashboard/get-queue")
    ? "getQueue"
    : pathname.startsWith("/dashboard/get-stub")
    ? "getStub"
    : pathname.startsWith("/dashboard/branches")
    ? "branches"
    : pathname.startsWith("/dashboard/services")
      ? "services"
      : pathname.startsWith("/dashboard/queues")
        ? "queues"
        : pathname.startsWith("/dashboard/terminals")
          ? "terminals"
        : pathname.startsWith("/dashboard/team")
          ? "team"
          : pathname.startsWith("/dashboard/reports")
            ? "reports"
            : pathname.startsWith("/dashboard/settings")
            ? "settings"
            : "overview";
  const currentActive = active ?? routeActive;

  const teamVisible = canManageTeam ?? (role === "owner" || role === "admin" || role === "manager");
  const servicesVisible = canManageServices ?? true;
  const branchesVisible = canManageBranches ?? true;
  const settingsVisible = canViewSettings ?? (role === "owner" || role === "admin" || role === "manager");
  const reportsVisible = canViewReports ?? (role === "owner" || role === "admin");
  const canOpenClientPage = role === "owner" || role === "admin";

  const nav = (
    <>
      <Link className={`nav-item ${currentActive === "overview" ? "nav-item-active" : ""}`} href="/dashboard" onClick={() => setOpen(false)}>Overview</Link>
      {branchesVisible ? <Link className={`nav-item ${currentActive === "branches" ? "nav-item-active" : ""}`} href="/dashboard/branches" onClick={() => setOpen(false)}>Branches</Link> : null}
      {servicesVisible ? <Link className={`nav-item ${currentActive === "services" ? "nav-item-active" : ""}`} href="/dashboard/services" onClick={() => setOpen(false)}>Services</Link> : null}
      <Link className={`nav-item ${currentActive === "queues" ? "nav-item-active" : ""}`} href="/dashboard/queues" onClick={() => setOpen(false)}>Queues</Link>
      <Link className={`nav-item mobile-get-stub-nav ${currentActive === "getStub" ? "nav-item-active" : ""}`} href="/dashboard/get-stub" onClick={() => setOpen(false)}>Get Stub</Link>
      <Link className={`nav-item mobile-get-stub-nav ${currentActive === "getQueue" ? "nav-item-active" : ""}`} href="/dashboard/get-queue" onClick={() => setOpen(false)}>Get Queue</Link>
      {(role === "owner" || role === "admin") ? <Link className={`nav-item ${currentActive === "terminals" ? "nav-item-active" : ""}`} href="/dashboard/terminals" onClick={() => setOpen(false)}>Terminals</Link> : null}
      {teamVisible ? <Link className={`nav-item ${currentActive === "team" ? "nav-item-active" : ""}`} href="/dashboard/team" onClick={() => setOpen(false)}>Team</Link> : null}
      {reportsVisible ? <Link className={`nav-item ${currentActive === "reports" ? "nav-item-active" : ""}`} href="/dashboard/reports" onClick={() => setOpen(false)}>History & Reports</Link> : null}
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
          {canOpenClientPage ? (
            <Link className="button button-ghost-light sidebar-client-button" href="/client" onClick={() => setOpen(false)}>Client Page</Link>
          ) : null}
          <form action={signOut} data-no-global-loading="true">
            <button className="button button-ghost-light" type="submit">Sign out</button>
          </form>
        </div>
      </aside>
    </>
  );
}
