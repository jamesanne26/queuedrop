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

export default async function SettingsPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/auth/login?next=%2Fdashboard%2Fsettings");

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, role, can_view_queue_information_editing, can_view_position_notifications, can_manage_operating_hours, can_manage_kiosk_display, businesses(name)")
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
  const canManageOperatingHours = businessWide || (role === "manager" && Boolean(membership.can_manage_operating_hours));

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
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Queue configuration</p>
            <h1>{business?.name ?? "QueueDrop"}</h1>
            <p className="muted page-lead">
              Each branch keeps its own queue rules.{" "}
              {businessWide
                ? "Owner/Admin can configure all business branches."
                : "You can configure only the settings and branches assigned to your account."}
            </p>
          </div>

          <span className="env-badge">TEST</span>
        </header>

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

            <section className="dashboard-section dashboard-section-stack settings-card">
              <div>
                <p className="eyebrow">Customer live view</p>
                <h2>Automatic refresh</h2>
                <p className="muted">Choose how often the customer queue page refreshes. Recommended: 8 seconds.</p>
              </div>
              <label className="settings-number-field">
                Refresh every (seconds)
                <input name="customer_refresh_seconds" type="number" min={3} max={300} step={1} defaultValue={config?.customer_refresh_seconds ?? 8} />
              </label>
            </section>

            {canViewPositionNotifications ? (
            <section className="dashboard-section dashboard-section-stack settings-card">
              <div>
                <p className="eyebrow">Position notifications</p>
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
            <section className="dashboard-section dashboard-section-stack settings-card">
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