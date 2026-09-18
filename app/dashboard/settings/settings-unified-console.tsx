"use client";

import type { ReactNode } from "react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type BranchNav = { id: string; name: string; address?: string | null; status?: string | null };
type ViewKey =
  | "branch-general"
  | "branch-services"
  | "branch-users"
  | "branch-operating"
  | "branch-queue"
  | "branch-notifications"
  | "branch-appearance"
  | "branch-terminals"
  | "services"
  | "users"
  | "roles"
  | "permissions"
  | "business"
  | "billing";

type Props = {
  branches: BranchNav[];
  initialBranchId?: string;
  initialView?: string;
  canManageBranches: boolean;
  canManageServices: boolean;
  canManageTeam: boolean;
  canManageRoles: boolean;
  canManageOperatingHours: boolean;
  canViewPositionNotifications: boolean;
  businessWide: boolean;
  addBranchPanel?: ReactNode;
  panels: Partial<Record<ViewKey, ReactNode>>;
};

type IconName = "branch" | "home" | "service" | "users" | "clock" | "sliders" | "bell" | "palette" | "terminal" | "business" | "billing" | "shield" | "role";

const branchViews = new Set<ViewKey>([
  "branch-general", "branch-services", "branch-users", "branch-operating", "branch-queue",
  "branch-notifications", "branch-appearance", "branch-terminals",
]);

const branchItems: Array<{ key: ViewKey; label: string; icon: IconName }> = [
  { key: "branch-general", label: "General", icon: "home" },
  { key: "branch-services", label: "Services", icon: "service" },
  { key: "branch-users", label: "Branch Users", icon: "users" },
  { key: "branch-operating", label: "Operating Hours", icon: "clock" },
  { key: "branch-queue", label: "Queue Settings", icon: "sliders" },
  { key: "branch-notifications", label: "Notifications", icon: "bell" },
  { key: "branch-appearance", label: "Appearance", icon: "palette" },
  { key: "branch-terminals", label: "Terminals", icon: "terminal" },
];

function Icon({ name }: { name: IconName }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "branch") return <svg {...common}><path d="M4 21V8l8-5 8 5v13"/><path d="M8 21v-7h8v7M4 10h16"/></svg>;
  if (name === "home") return <svg {...common}><path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-6h6v6"/></svg>;
  if (name === "service") return <svg {...common}><path d="M4 7h16M6 7V5h12v2M7 11h10v8H7z"/><path d="M9 15h6"/></svg>;
  if (name === "users") return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (name === "clock") return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
  if (name === "sliders") return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="11" cy="18" r="2"/></svg>;
  if (name === "bell") return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>;
  if (name === "palette") return <svg {...common}><path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5H12a2 2 0 0 1 0-4h4a5 5 0 0 0 5-5c0-2.2-3.6-4-9-4Z"/><path d="M7.5 8h.01M10 5.5h.01M6 12h.01"/></svg>;
  if (name === "terminal") return <svg {...common}><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 18h6M8 6h8v8H8z"/></svg>;
  if (name === "business") return <svg {...common}><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M8 10h.01M12 10h.01M16 10h.01"/></svg>;
  if (name === "billing") return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h4"/></svg>;
  if (name === "shield") return <svg {...common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>;
  return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0M18 4l2 2"/></svg>;
}

function normalizeView(value?: string): ViewKey {
  const allowed: ViewKey[] = [
    "branch-general", "branch-services", "branch-users", "branch-operating", "branch-queue",
    "branch-notifications", "branch-appearance", "branch-terminals", "services", "users", "roles",
    "permissions", "business", "billing",
  ];
  return allowed.includes(value as ViewKey) ? (value as ViewKey) : "branch-general";
}

export function SettingsUnifiedConsole({
  branches,
  initialBranchId,
  initialView,
  canManageBranches,
  canManageServices,
  canManageTeam,
  canManageRoles,
  canManageOperatingHours,
  canViewPositionNotifications,
  businessWide,
  addBranchPanel,
  panels,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<ViewKey>(normalizeView(initialView));
  const [branchesOpen, setBranchesOpen] = useState(() => branchViews.has(normalizeView(initialView)) && Boolean(initialBranchId ?? branches[0]?.id));
  const [accessOpen, setAccessOpen] = useState(() => ["users", "roles", "permissions"].includes(normalizeView(initialView)));
  const [activeBranchId, setActiveBranchId] = useState(initialBranchId ?? branches[0]?.id);
  const [isBranchSwitching, startBranchTransition] = useTransition();
  const [isViewSwitching, startViewTransition] = useTransition();
  const selectedBranch = useMemo(() => branches.find((branch) => branch.id === activeBranchId) ?? branches[0], [branches, activeBranchId]);
  const sortedBranches = useMemo(() => [...branches].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })), [branches]);


  const getBranchUrl = (branchId: string, targetView: ViewKey = (branchViews.has(view) ? view : "branch-general")) => {
    const url = new URL(window.location.href);
    url.searchParams.set("branch", branchId);
    url.searchParams.set("view", targetView);
    return `${url.pathname}?${url.searchParams.toString()}`;
  };

  const chooseView = (next: ViewKey) => {
    if (next === view || isViewSwitching || isBranchSwitching) return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    const nextUrl = `${url.pathname}?${url.searchParams.toString()}`;
    // Keep the current server-rendered panel visible until the next route payload
    // arrives. Switching optimistically used to expose empty placeholder arrays
    // for Users/Roles before their view-specific data had loaded.
    startViewTransition(() => router.replace(nextUrl, { scroll: false }));
  };

  const chooseBranch = (branchId: string) => {
    const nextView: ViewKey = branchViews.has(view) ? view : "branch-general";
    setActiveBranchId(branchId);
    setView(nextView);
    setBranchesOpen(true);
    const nextUrl = getBranchUrl(branchId, nextView);
    startBranchTransition(() => router.replace(nextUrl, { scroll: false }));
  };

  const hiddenBranchItem = (key: ViewKey) =>
    (key === "branch-general" && !canManageBranches) ||
    (key === "branch-services" && !canManageServices) ||
    (key === "branch-users" && !canManageTeam) ||
    (key === "branch-operating" && !canManageOperatingHours) ||
    (key === "branch-notifications" && !canViewPositionNotifications) ||
    ((key === "branch-appearance" || key === "branch-terminals") && !businessWide);

  const configPanel = panels[view] ?? panels["branch-general"];
  const activeLabel = branchItems.find((entry) => entry.key === view)?.label
    ?? ({ services: "Services", users: "Users", roles: "Roles", permissions: "Permissions", business: "Business", billing: "Billing & Subscription" } as Partial<Record<ViewKey, string>>)[view]
    ?? "Settings";

  return (
    <div className="settings-console settings-console-unified">
      {isBranchSwitching || isViewSwitching ? <div className="qd-loading-backdrop settings-switch-loading" role="status" aria-live="polite"><section className="qd-loading-modal"><div className="qd-loading-spinner" aria-hidden="true" /><strong>Please wait</strong><small>{isBranchSwitching ? `Loading ${selectedBranch?.name ?? "branch"} settings…` : "Loading settings section…"}</small></section></div> : null}
      <aside className="settings-console-sidebar">
        <details className="settings-tree-shell settings-tree-shell-unified" open>
          <summary className="settings-tree-mobile-summary">Settings menu <span>⌄</span></summary>
          <nav className="settings-tree" aria-label="Settings navigation">
            <section className="settings-tree-group settings-tree-branches-v4">
              <button type="button" className="settings-tree-top-row settings-tree-expand-button" data-settings-group="branches" aria-expanded={branchesOpen} onClick={() => setBranchesOpen((open) => !open)}>
                <span className="settings-tree-icon"><Icon name="branch" /></span>
                <strong>Branches <small className="settings-branch-counts">{branches.filter((b) => b.status === "active").length} active · {branches.filter((b) => b.status !== "active").length} inactive</small></strong>
                <span className="settings-tree-caret">{branchesOpen ? "⌄" : "›"}</span>
              </button>

              {branchesOpen ? (
                <>
                  <div className="settings-tree-branch-list settings-tree-branch-list-v4">
                    {sortedBranches.map((branch) => {
                      const selected = branch.id === selectedBranch?.id;
                      return (
                        <button
                          type="button"
                          key={branch.id}
                          data-branch-id={branch.id}
                          aria-current={selected ? "page" : undefined}
                          className={`settings-tree-branch settings-tree-branch-button ${selected ? "settings-tree-branch-active" : ""}`}
                          onClick={() => chooseBranch(branch.id)}
                        >
                          <span className={`settings-tree-dot ${selected ? "settings-tree-dot-active" : ""}`} />
                          <span><strong>{branch.name}</strong><small>{branch.address || "No address added"}</small><em className={`settings-branch-status settings-branch-status-${branch.status === "active" ? "active" : "inactive"}`}>{branch.status === "active" ? "Active" : "Inactive"}</em></span>
                        </button>
                      );
                    })}
                  </div>
                  {addBranchPanel ? <div className="settings-tree-add-branch-v4">{addBranchPanel}</div> : null}
                </>
              ) : null}
            </section>

            {canManageServices ? (
              <section className="settings-tree-group settings-tree-services-group">
                <button type="button" data-settings-target="services" aria-current={view === "services" ? "page" : undefined} className={`settings-tree-top-row settings-tree-expand-button settings-tree-direct-section ${view === "services" ? "settings-tree-direct-section-active" : ""}`} onClick={() => chooseView("services")}>
                  <span className="settings-tree-icon settings-tree-icon-services"><Icon name="service" /></span>
                  <strong>Services</strong>
                  <span className="settings-tree-caret">›</span>
                </button>
              </section>
            ) : null}

            {canManageTeam || canManageRoles ? (
              <section className="settings-tree-group settings-tree-access-group">
                <button type="button" className="settings-tree-top-row settings-tree-expand-button" data-settings-group="access" aria-expanded={accessOpen} onClick={() => setAccessOpen((open) => !open)}>
                  <span className="settings-tree-icon settings-tree-icon-team"><Icon name="users" /></span><strong>Users &amp; Access</strong><span className="settings-tree-caret">{accessOpen ? "⌄" : "›"}</span>
                </button>
                {accessOpen ? <div className="settings-tree-branch-sections settings-tree-access-sections">
                  {canManageTeam ? <button type="button" data-settings-target="users" aria-current={view === "users" ? "page" : undefined} className={`settings-tree-subitem settings-tree-subitem-button ${view === "users" ? "settings-tree-subitem-active" : ""}`} onClick={() => chooseView("users")}><span><Icon name="users" /></span><span>Users</span></button> : null}
                  {canManageRoles ? <button type="button" data-settings-target="roles" aria-current={view === "roles" ? "page" : undefined} className={`settings-tree-subitem settings-tree-subitem-button ${view === "roles" ? "settings-tree-subitem-active" : ""}`} onClick={() => chooseView("roles")}><span><Icon name="role" /></span><span>Roles</span></button> : null}
                  {canManageRoles ? <button type="button" data-settings-target="permissions" aria-current={view === "permissions" ? "page" : undefined} className={`settings-tree-subitem settings-tree-subitem-button ${view === "permissions" ? "settings-tree-subitem-active" : ""}`} onClick={() => chooseView("permissions")}><span><Icon name="shield" /></span><span>Permissions</span></button> : null}
                </div> : null}
              </section>
            ) : null}

            {businessWide ? <section className="settings-tree-group"><button type="button" data-settings-target="business" aria-current={view === "business" ? "page" : undefined} className={`settings-tree-top-row settings-tree-expand-button settings-tree-direct-section ${view === "business" ? "settings-tree-direct-section-active" : ""}`} onClick={() => chooseView("business")}><span className="settings-tree-icon"><Icon name="business" /></span><strong>Business</strong><span className="settings-tree-caret">›</span></button></section> : null}
            {businessWide ? <section className="settings-tree-group"><button type="button" data-settings-target="billing" aria-current={view === "billing" ? "page" : undefined} className={`settings-tree-top-row settings-tree-expand-button settings-tree-direct-section ${view === "billing" ? "settings-tree-direct-section-active" : ""}`} onClick={() => chooseView("billing")}><span className="settings-tree-icon settings-tree-icon-billing"><Icon name="billing" /></span><strong>Billing &amp; Subscription</strong><span className="settings-tree-caret">›</span></button></section> : null}
          </nav>
        </details>
      </aside>

      <main className="settings-console-main settings-unified-main" data-settings-view={view}>
        <div className="settings-breadcrumb">
          <span>Settings</span><span>›</span>
          {branchViews.has(view) && selectedBranch ? <><span>Branches</span><span>›</span><span>{selectedBranch.name}</span><span>›</span></> : null}
          <strong>{activeLabel}</strong>
        </div>

        {selectedBranch && branchViews.has(view) ? (
          <>
            <header className="settings-branch-hero settings-branch-hero-unified settings-branch-hero-no-switcher">
              <div className="settings-branch-avatar"><Icon name="branch" /></div>
              <div className="settings-branch-hero-copy">
                <div className="settings-branch-title-row"><h2>{selectedBranch.name}</h2><span className={`settings-status-pill ${selectedBranch.status === "inactive" ? "settings-status-inactive" : "settings-status-active"}`}><span />{selectedBranch.status === "inactive" ? "Inactive" : "Active"}</span></div>
                <p>{selectedBranch.address || "No branch address added"}</p>
                <small>Selected branch · all tabs below apply only to this branch</small>
              </div>
            </header>
            <div className="settings-detail-tabs-v2 settings-detail-tabs-buttons" role="tablist" aria-label="Branch settings sections">
              {branchItems.map(({ key, label }) => hiddenBranchItem(key) ? null : <button key={key} type="button" role="tab" data-settings-target={key} aria-selected={view === key} className={view === key ? "settings-detail-tab-current" : ""} onClick={() => chooseView(key)}>{label}</button>)}
            </div>
          </>
        ) : null}

        <div className="settings-unified-panel settings-unified-panel-v3">{configPanel}</div>
      </main>
    </div>
  );
}
