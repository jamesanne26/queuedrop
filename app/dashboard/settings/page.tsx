import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardResultModal } from "@/app/dashboard/_components/dashboard-result-modal";
import { PreserveDashboardScroll } from "@/app/dashboard/_components/preserve-dashboard-scroll";
import { createClient } from "@/lib/supabase/server";
import { updateQueueSettings } from "./actions";
import { DAYS } from "./constants";
import { PositionRules } from "./position-rules";
import { ResponsiveBranchSelect } from "@/app/dashboard/_components/responsive-branch-select";
import { SettingsSaveGuard } from "./settings-save-guard";

type Props = {
  searchParams: Promise<{
    branch?: string;
    message?: string;
    error?: string;
    saved?: string;
  }>;
};

type Role = "owner" | "admin" | "manager" | "staff";

function SettingsTileIcon({ name }: { name: "business" | "branches" | "services" | "team" | "queue" | "customer" | "notifications" | "security" | "reports" | "billing" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths = {
    business: <><path {...common} d="M4 9h16M6 9V5h12v4M7 13h3v6H7zM14 13h3v6h-3z"/><path {...common} d="M4 19h16"/></>,
    branches: <><path {...common} d="M4 10 12 4l8 6"/><path {...common} d="M6 9v10h12V9M9 19v-5h6v5"/></>,
    services: <><path {...common} d="m6 4 12 16M18 4 6 20"/><circle {...common} cx="7" cy="6" r="2"/><circle {...common} cx="17" cy="6" r="2"/></>,
    team: <><circle {...common} cx="9" cy="8" r="3"/><path {...common} d="M4 19v-1a5 5 0 0 1 10 0v1M16 8a2.5 2.5 0 1 1 0 5M17 14a4 4 0 0 1 3 4"/></>,
    queue: <><circle {...common} cx="12" cy="12" r="8"/><path {...common} d="M12 8v4l3 2"/></>,
    customer: <><circle {...common} cx="12" cy="8" r="3"/><path {...common} d="M5 20a7 7 0 0 1 14 0"/></>,
    notifications: <><path {...common} d="M6 9a6 6 0 0 1 12 0v4l2 3H4l2-3z"/><path {...common} d="M10 19h4"/></>,
    security: <><rect {...common} x="5" y="10" width="14" height="10" rx="2"/><path {...common} d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2"/></>,
    reports: <><path {...common} d="M5 20V10h4v10M10 20V4h4v16M15 20v-7h4v7"/></>,
    billing: <><rect {...common} x="3" y="6" width="18" height="12" rx="2"/><path {...common} d="M3 10h18M7 15h4"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

function SettingsOverviewCard({ icon, title, description, children, href }: { icon: Parameters<typeof SettingsTileIcon>[0]["name"]; title: string; description: string; children: ReactNode; href?: string }) {
  const heading = (
    <div className="settings-overview-heading">
      <span className="settings-overview-icon"><SettingsTileIcon name={icon} /></span>
      <span className="settings-overview-heading-copy"><strong>{title}</strong><small>{description}</small></span>
      {href ? <span className="settings-overview-arrow" aria-hidden="true">›</span> : null}
    </div>
  );
  return <article className="settings-overview-card">{href ? <Link href={href} className="settings-overview-main-link">{heading}</Link> : heading}<div className="settings-overview-rows">{children}</div></article>;
}

function SettingsOverviewRow({ href, children, muted }: { href?: string; children: ReactNode; muted?: boolean }) {
  if (href) return <Link href={href} className="settings-overview-row"><span>{children}</span><span aria-hidden="true">›</span></Link>;
  return <div className={muted ? "settings-overview-row settings-overview-row-muted" : "settings-overview-row"}><span>{children}</span>{muted ? <small>Available in this workspace</small> : null}</div>;
}

export default async function SettingsPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/auth/login?next=%2Fdashboard%2Fsettings");

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, role, can_view_queue_information_editing, can_view_position_notifications, can_set_branch_status, can_manage_services, can_manage_operating_hours, can_manage_team, can_manage_kiosk_display, can_view_reports, can_export_reports, can_view_audit_logs, businesses(name)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/dashboard");

  const role = membership.role as Role;
  const businessWide = role === "owner" || role === "admin";
  const canViewQueueInformationEditing =
    businessWide || Boolean(membership.can_view_queue_information_editing);
  const canViewPositionNotifications =
    businessWide || Boolean(membership.can_view_position_notifications);
  const canManageOperatingHours = businessWide || Boolean(membership.can_manage_operating_hours);
  const canManageBranches = businessWide || Boolean(membership.can_set_branch_status) || canManageOperatingHours || Boolean(membership.can_manage_kiosk_display);
  const canManageServices = businessWide || Boolean(membership.can_manage_services);
  const canManageTeam = businessWide || Boolean(membership.can_manage_team);
  const canViewReports = businessWide || Boolean(membership.can_view_reports) || Boolean(membership.can_export_reports);

  if (
    !canViewQueueInformationEditing &&
    !canViewPositionNotifications &&
    !canManageOperatingHours
  ) {
    redirect("/dashboard");
  }
  const business = Array.isArray(membership.businesses)
    ? membership.businesses[0]
    : membership.businesses;

  let allowedBranchIds: string[] | null = null;

  if (!businessWide) {
    const { data: assignments } = await supabase
      .from("branch_users")
      .select("branch_id")
      .eq("user_id", user.id);

    allowedBranchIds = (assignments ?? []).map((row) => row.branch_id);
  }

  let branchQuery = supabase
    .from("branches")
    .select("id, name, slug, status, timezone, address")
    .eq("business_id", membership.business_id)
    .order("created_at", { ascending: true });

  if (!businessWide && allowedBranchIds) {
    branchQuery = branchQuery.in(
      "id",
      allowedBranchIds.length
        ? allowedBranchIds
        : ["00000000-0000-0000-0000-000000000000"],
    );
  }

  const { data: branches } = await branchQuery;

  const selectedBranchId =
    params.branch &&
    (branches ?? []).some((branch) => branch.id === params.branch)
      ? params.branch
      : branches?.[0]?.id;

  const selectedBranch = (branches ?? []).find(
    (branch) => branch.id === selectedBranchId,
  );

  const [configResult, hoursResult, notificationRulesResult] = selectedBranchId
    ? await Promise.all([
        supabase
          .from("queue_configurations")
          .select(
            "starting_number, no_show_minutes, allow_qr_join, is_active, show_branch_contact, customer_refresh_seconds, customer_can_edit_name, customer_can_edit_mobile, staff_can_edit_name, staff_can_edit_mobile, manager_can_edit_name, manager_can_edit_mobile",
          )
          .eq("branch_id", selectedBranchId)
          .maybeSingle(),
        supabase
          .from("operating_hours")
          .select("day_of_week, is_open, open_time, close_time")
          .eq("branch_id", selectedBranchId)
          .order("day_of_week", { ascending: true }),
        supabase
          .from("position_notification_rules")
          .select("position, send_sms_once, browser_notification")
          .eq("branch_id", selectedBranchId)
          .order("position", { ascending: true }),
      ])
    : [
        { data: null },
        { data: [] },
        { data: [] },
      ];

  const config = configResult.data;
  const hours = hoursResult.data;
  const notificationRules = notificationRulesResult.data;

  const hoursByDay = new Map(
    (hours ?? []).map((row) => [row.day_of_week, row]),
  );

  // Important:
  // The settings inputs are intentionally remounted when the branch changes
  // or after a successful save. This prevents uncontrolled checkbox/input
  // state from visually leaking between branches and guarantees that the
  // form immediately reflects the values just read back from the database.
  const settingsFormKey = `${selectedBranchId ?? "none"}:${params.saved ?? "initial"}`;

  return (
    <>
      <PreserveDashboardScroll />
      <DashboardResultModal success={params.message} error={params.error} />
      <section className="dashboard-content">
        <header className="dashboard-header settings-page-header">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>Settings</h1>
            <p className="muted page-lead">
              Configure {business?.name ?? "your business"} from one place. Choose a section below, then manage branch-specific queue rules further down the page.
            </p>
          </div>
          <span className="env-badge">TEST</span>
        </header>

        <section className="settings-overview" aria-label="Settings overview">
          <div className="settings-overview-grid">
            {businessWide ? <SettingsOverviewCard icon="business" title="Business" description="Profile, contact details, and business information.">
              <SettingsOverviewRow>Business information</SettingsOverviewRow>
              <SettingsOverviewRow href="/dashboard/branches">Business locations</SettingsOverviewRow>
              <SettingsOverviewRow>Contact details</SettingsOverviewRow>
            </SettingsOverviewCard> : null}

            {canManageBranches ? <SettingsOverviewCard icon="branches" title="Branches" description="Manage branches and their operating setup." href="/dashboard/branches">
              <SettingsOverviewRow href="/dashboard/branches">Branch list & status</SettingsOverviewRow>
              <SettingsOverviewRow href="/dashboard/branches">Operating hours</SettingsOverviewRow>
              {canManageTeam ? <SettingsOverviewRow href="/dashboard/team">Branch access</SettingsOverviewRow> : <SettingsOverviewRow>Branch access</SettingsOverviewRow>}
            </SettingsOverviewCard> : null}

            {canManageServices ? <SettingsOverviewCard icon="services" title="Services" description="Manage offered services and queue behavior." href="/dashboard/services">
              <SettingsOverviewRow href="/dashboard/services">Service list</SettingsOverviewRow>
              <SettingsOverviewRow href="/dashboard/services">Queue prefix & duration</SettingsOverviewRow>
              <SettingsOverviewRow href="/dashboard/services">Service availability</SettingsOverviewRow>
            </SettingsOverviewCard> : null}

            {canManageTeam ? <SettingsOverviewCard icon="team" title="Team & Roles" description="Employees, role names, permissions, and access." href="/dashboard/team?tab=roles">
              <SettingsOverviewRow href="/dashboard/team?tab=employees">Employees</SettingsOverviewRow>
              <SettingsOverviewRow href="/dashboard/team?tab=roles">Roles & branch scope</SettingsOverviewRow>
              <SettingsOverviewRow href="/dashboard/team?tab=permissions">Permissions</SettingsOverviewRow>
            </SettingsOverviewCard> : null}

            <SettingsOverviewCard icon="queue" title="Queue Configuration" description="Configure how each branch queue works." href="#queue-configuration">
              <SettingsOverviewRow href="#queue-configuration">Branch queue settings</SettingsOverviewRow>
              <SettingsOverviewRow href="#customer-experience">Customer refresh</SettingsOverviewRow>
              <SettingsOverviewRow href="#notifications">Position notifications</SettingsOverviewRow>
            </SettingsOverviewCard>

            <SettingsOverviewCard icon="customer" title="Customer Experience" description="Control customer-facing queue behavior." href="#customer-experience">
              <SettingsOverviewRow href="#customer-experience">Queue status refresh</SettingsOverviewRow>
              <SettingsOverviewRow href="#customer-editing">Customer editing</SettingsOverviewRow>
              {canManageBranches ? <SettingsOverviewRow href="/dashboard/branches">Branch contact visibility</SettingsOverviewRow> : <SettingsOverviewRow>Branch contact visibility</SettingsOverviewRow>}
            </SettingsOverviewCard>

            <SettingsOverviewCard icon="notifications" title="Notifications" description="Choose when queue-position alerts are sent." href="#notifications">
              <SettingsOverviewRow href="#notifications">Position triggers</SettingsOverviewRow>
              <SettingsOverviewRow href="#notifications">SMS notification rules</SettingsOverviewRow>
              <SettingsOverviewRow href="#notifications">Browser notifications</SettingsOverviewRow>
            </SettingsOverviewCard>

            {canManageTeam ? <SettingsOverviewCard icon="security" title="Security & Access" description="Control employee access and sensitive data." href="/dashboard/team?tab=permissions">
              <SettingsOverviewRow href="/dashboard/team?tab=permissions">Role permissions</SettingsOverviewRow>
              <SettingsOverviewRow href="/dashboard/team?tab=employees">Employee branch access</SettingsOverviewRow>
              {businessWide ? <SettingsOverviewRow href="/client/configurations">Configuration access</SettingsOverviewRow> : <SettingsOverviewRow>Configuration access</SettingsOverviewRow>}
            </SettingsOverviewCard> : null}

            {canViewReports ? <SettingsOverviewCard icon="reports" title="Reports" description="Report access, exports, and operational visibility." href="/dashboard/reports">
              <SettingsOverviewRow href="/dashboard/reports">Report dashboard</SettingsOverviewRow>
              <SettingsOverviewRow href="/dashboard/reports">Export reports</SettingsOverviewRow>
              {canManageTeam ? <SettingsOverviewRow href="/dashboard/team?tab=roles">Report permissions by role</SettingsOverviewRow> : <SettingsOverviewRow>Report permissions</SettingsOverviewRow>}
            </SettingsOverviewCard> : null}

            {businessWide ? <SettingsOverviewCard icon="billing" title="Billing & Subscription" description="Plan, limits, checkout, and billing history." href="/client/subscription">
              <SettingsOverviewRow href="/client/subscription">Current plan</SettingsOverviewRow>
              <SettingsOverviewRow href="/client/subscription">Usage & limits</SettingsOverviewRow>
              <SettingsOverviewRow href="/client/subscription">Billing history</SettingsOverviewRow>
            </SettingsOverviewCard> : null}
          </div>
        </section>

        <div className="settings-section-divider" id="queue-configuration">
          <div><p className="eyebrow">Branch settings</p><h2>Queue Configuration</h2><p className="muted">Select a branch and update its customer-facing queue behavior.</p></div>
        </div>

        {selectedBranchId && selectedBranch ? (
          <form
            key={settingsFormKey}
            action={updateQueueSettings}
            className="settings-layout"
          >
            <input type="hidden" name="branch_id" value={selectedBranchId} />

            <div className="dashboard-section settings-branch-toolbar">
              <ResponsiveBranchSelect
                branches={(branches ?? []).map((branch) => ({
                  id: branch.id,
                  name: branch.name,
                  meta: branch.address || undefined,
                }))}
                selectedBranchId={selectedBranchId ?? ""}
              />

              <div
                className="settings-branch-links-desktop"
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  gap: 12,
                  minWidth: 0,
                  flex: 1,
                  flexWrap: "wrap",
                }}
              >
                {(branches ?? []).map((branch) => {
                  const isSelected = branch.id === selectedBranchId;

                  return (
                    <Link
                      key={branch.id}
                      href={`/dashboard/settings?branch=${branch.id}`}
                      scroll={false}
                      aria-current={isSelected ? "page" : undefined}
                      style={{
                        minWidth: 250,
                        maxWidth: 340,
                        flex: "1 1 260px",
                        textDecoration: "none",
                        color: "inherit",
                        border: isSelected
                          ? "2px solid #159263"
                          : "1px solid #b7d9c9",
                        borderRadius: 14,
                        padding: "10px 14px",
                        background: isSelected
                          ? "#d9f5e8"
                          : "#f7fcf9",
                        boxShadow: isSelected
                          ? "0 0 0 2px rgba(21, 146, 99, 0.08)"
                          : "none",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontWeight: 700,
                        }}
                      >
                        <span>{branch.name}</span>
                      </div>

                      <div
                        className="muted"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginTop: 4,
                          fontSize: 13,
                          lineHeight: 1.35,
                        }}
                      >
                        <span>{branch.address || "No branch address added"}</span>
                      </div>
                    </Link>
                  );
                })}

                <Link
                  href="/dashboard/branches"
                  className="text-link"
                  style={{
                    alignSelf: "center",
                    whiteSpace: "nowrap",
                    padding: "10px 4px",
                  }}
                >
                  View branches
                </Link>
              </div>

              <SettingsSaveGuard branchName={selectedBranch.name} />
            </div>

            {/* Queue rules are intentionally hidden from the Settings UI for now.
                Keep their current values in the form so unrelated saves do not reset them. */}
            <input type="hidden" name="starting_number" value={config?.starting_number ?? 1} />
            <input type="hidden" name="no_show_minutes" value={config?.no_show_minutes ?? 5} />
            <input type="hidden" name="timezone" value={selectedBranch.timezone ?? "Asia/Manila"} />
            {config?.is_active ?? true ? <input type="hidden" name="is_active" value="on" /> : null}
            {config?.allow_qr_join ?? true ? <input type="hidden" name="allow_qr_join" value="on" /> : null}
            {config?.show_branch_contact ?? true ? <input type="hidden" name="show_branch_contact" value="on" /> : null}

            <section id="customer-experience" className="dashboard-section dashboard-section-stack settings-card settings-feature-card">
              <div>
                <p className="eyebrow">Customer experience</p>
                <h2>Automatic refresh</h2>
                <p className="muted">Choose how often the customer queue page refreshes. Recommended: 8 seconds.</p>
              </div>
              <label className="settings-number-field">
                Refresh every (seconds)
                <input name="customer_refresh_seconds" type="number" min={3} max={300} step={1} defaultValue={config?.customer_refresh_seconds ?? 8} />
              </label>
            </section>

            {canViewPositionNotifications ? (
            <section id="notifications" className="dashboard-section dashboard-section-stack settings-card settings-feature-card">
              <div>
                <p className="eyebrow">Notifications</p>
                <h2>Notify customers by queue position</h2>
                <p className="muted">
                  Example: send one SMS and/or browser notification when a
                  ticket reaches position 2.
                </p>
              </div>

              <PositionRules
                key={`${selectedBranchId}:${params.saved ?? "initial"}:position-rules`}
                initialRules={(notificationRules ?? []).map((rule) => ({
                  position: rule.position,
                  send_sms_once: rule.send_sms_once,
                  browser_notification: rule.browser_notification,
                }))}
              />
            </section>

            ) : (
              <>
                <input type="hidden" name="position_rule_count" value={(notificationRules ?? []).length} />
                {(notificationRules ?? []).map((rule, index) => (
                  <span key={`hidden-position-rule-${rule.position}`} style={{ display: "none" }}>
                    <input type="hidden" name={`position_rule_${index}_position`} value={rule.position} />
                    {rule.send_sms_once ? <input type="hidden" name={`position_rule_${index}_sms`} value="on" /> : null}
                    {rule.browser_notification ? <input type="hidden" name={`position_rule_${index}_browser`} value="on" /> : null}
                  </span>
                ))}
              </>
            )}

            {canViewQueueInformationEditing ? (
            <section id="customer-editing" className="dashboard-section dashboard-section-stack settings-card settings-feature-card">
              <div>
                <p className="eyebrow">Queue information editing</p>
                <h2>Who may update name & mobile</h2>
                <p className="muted">
                  Owner/Admin are always allowed. Customer, Staff, and Manager
                  permissions are configurable per branch.
                </p>
              </div>

              <div className="permission-grid">
                <div className="permission-card">
                  <strong>Customer</strong>
                  <label>
                    <input
                      type="checkbox"
                      name="customer_can_edit_name"
                      defaultChecked={config?.customer_can_edit_name ?? false}
                    />{" "}
                    Can edit name
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="customer_can_edit_mobile"
                      defaultChecked={config?.customer_can_edit_mobile ?? false}
                    />{" "}
                    Can edit mobile number
                  </label>
                </div>

                <div className="permission-card">
                  <strong>Staff</strong>
                  <label>
                    <input
                      type="checkbox"
                      name="staff_can_edit_name"
                      defaultChecked={config?.staff_can_edit_name ?? true}
                    />{" "}
                    Can edit name
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="staff_can_edit_mobile"
                      defaultChecked={config?.staff_can_edit_mobile ?? true}
                    />{" "}
                    Can edit mobile number
                  </label>
                </div>

                <div className="permission-card">
                  <strong>Manager</strong>
                  <label>
                    <input
                      type="checkbox"
                      name="manager_can_edit_name"
                      defaultChecked={config?.manager_can_edit_name ?? true}
                    />{" "}
                    Can edit name
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="manager_can_edit_mobile"
                      defaultChecked={config?.manager_can_edit_mobile ?? true}
                    />{" "}
                    Can edit mobile number
                  </label>
                </div>
              </div>
            </section>

            ) : (
              <>
                {config?.customer_can_edit_name ? <input type="hidden" name="customer_can_edit_name" value="on" /> : null}
                {config?.customer_can_edit_mobile ? <input type="hidden" name="customer_can_edit_mobile" value="on" /> : null}
                {config?.staff_can_edit_name ? <input type="hidden" name="staff_can_edit_name" value="on" /> : null}
                {config?.staff_can_edit_mobile ? <input type="hidden" name="staff_can_edit_mobile" value="on" /> : null}
                {config?.manager_can_edit_name ? <input type="hidden" name="manager_can_edit_name" value="on" /> : null}
                {config?.manager_can_edit_mobile ? <input type="hidden" name="manager_can_edit_mobile" value="on" /> : null}
              </>
            )}

            {canManageOperatingHours ? (
            <section className="dashboard-section dashboard-section-stack settings-card">
              <div>
                <p className="eyebrow">Operating rules</p>
                <h2>Weekly hours</h2>
                <p className="muted">
                  Public joining is blocked outside these hours. Existing staff
                  queue operations remain available.
                </p>
              </div>

              <div className="hours-list">
                {DAYS.map((day) => {
                  const row = hoursByDay.get(day.value);
                  const isOpen = row?.is_open ?? true;

                  return (
                    <div className="hours-row" key={day.value}>
                      <label className="hours-day">
                        <input
                          type="checkbox"
                          name={`day_${day.value}_open`}
                          defaultChecked={isOpen}
                        />
                        <strong>{day.label}</strong>
                      </label>

                      <label>
                        Open
                        <input
                          type="time"
                          name={`day_${day.value}_open_time`}
                          defaultValue={(row?.open_time ?? "09:00").slice(0, 5)}
                        />
                      </label>

                      <label>
                        Close
                        <input
                          type="time"
                          name={`day_${day.value}_close_time`}
                          defaultValue={(row?.close_time ?? "18:00").slice(0, 5)}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>

            </section>
            ) : (
              <div style={{ display: "none" }}>
                {DAYS.map((day) => {
                  const row = hoursByDay.get(day.value);
                  const isOpen = row?.is_open ?? true;
                  return (
                    <span key={`hidden-hours-${day.value}`}>
                      {isOpen ? <input type="hidden" name={`day_${day.value}_open`} value="on" /> : null}
                      <input type="hidden" name={`day_${day.value}_open_time`} value={(row?.open_time ?? "09:00").slice(0, 5)} />
                      <input type="hidden" name={`day_${day.value}_close_time`} value={(row?.close_time ?? "18:00").slice(0, 5)} />
                    </span>
                  );
                })}
              </div>
            )}
          </form>
        ) : (
          <section className="mini-empty">
            <strong>No branch available.</strong>
            <span>
              Create or assign a branch before configuring queue rules.
            </span>
          </section>
        )}
      </section>
    </>
  );
}