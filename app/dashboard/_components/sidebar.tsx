"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/app/auth/actions";

type NavKey = "overview" | "branches" | "services" | "queues" | "team" | "reports" | "settings";

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
  const router = useRouter();
  const pathname = usePathname();

  const routeActive: NavKey = pathname.startsWith("/dashboard/branches")
    ? "branches"
    : pathname.startsWith("/dashboard/services")
      ? "services"
      : pathname.startsWith("/dashboard/queues")
        ? "queues"
        : pathname.startsWith("/dashboard/team")
          ? "team"
          : pathname.startsWith("/dashboard/reports")
            ? "reports"
            : pathname.startsWith("/dashboard/settings")
            ? "settings"
            : "overview";
  const currentActive = active ?? routeActive;

  useEffect(() => {
    const routes = [
      "/dashboard",
      "/dashboard/branches",
      "/dashboard/services",
      "/dashboard/queues",
      "/dashboard/team",
      "/dashboard/reports",
      "/dashboard/settings",
    ];

    const prefetch = () => {
      for (const route of routes) router.prefetch(route);
    };

    const idleCallback = window.requestIdleCallback;

    if (typeof idleCallback === "function") {
      const idleId = idleCallback(prefetch, { timeout: 1200 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = globalThis.setTimeout(prefetch, 250);
    return () => globalThis.clearTimeout(timeoutId);
  }, [router]);

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
