import { redirect } from "next/navigation";
import { DashboardResultModal } from "@/app/dashboard/_components/dashboard-result-modal";
import { PreserveDashboardScroll } from "@/app/dashboard/_components/preserve-dashboard-scroll";
import { DigitsOnlyInput } from "@/app/_components/digits-only-input";
import { createClient } from "@/lib/supabase/server";
import { createBranch, deleteBranch, updateBranch } from "@/app/dashboard/branches/actions";
import { PendingSubmitButton } from "@/app/dashboard/_components/pending-submit-button";
import { TeamWorkspace } from "@/app/dashboard/team/team-workspace";
import { RoleManagement } from "@/app/dashboard/team/role-management";
import accessStyles from "@/app/dashboard/team/team-access.module.css";
import { TerminalForm } from "@/app/dashboard/terminals/terminal-form";
import { CreateTerminalForm } from "@/app/dashboard/terminals/create-terminal-form";
import { CopyTokenButton } from "@/app/dashboard/terminals/copy-token-button";
import { deleteTerminal, updateTerminal } from "@/app/dashboard/terminals/actions";
import { startSubscriptionCheckout } from "@/app/client/subscription/actions";
import { updateBusinessProfile, updateQueueSettings, updateTerminalAppearance } from "./actions";
import { DAYS } from "./constants";
import { PositionRules } from "./position-rules";
import { SettingsSaveGuard } from "./settings-save-guard";
import { TerminalAppearanceForm } from "./terminal-appearance-form";
import { SettingsUnifiedConsole } from "./settings-unified-console";
import { ServiceCatalog, BranchServiceAssignments } from "./service-catalog";
import { BranchUserAssignment } from "./branch-user-assignment";
import { ConfirmDeleteSubmit } from "@/app/dashboard/_components/confirm-delete-submit";
import { readPinRevealToken } from "@/lib/terminal/pin-reveal";

type Props = { searchParams: Promise<{ branch?: string; view?: string; message?: string; error?: string; saved?: string; role?: string; pin_reveal?: string }> };
type Role = "owner" | "admin" | "manager" | "staff";
type BusinessRole = { id: string; name: string; description: string | null; base_role: Role; branch_scope: "own_branch_only" | "selected_branches" | "all_branches"; is_system: boolean; is_protected: boolean };
type Permission = { code: string; label: string; description: string | null; category: string; sort_order: number };
type Member = {
  id: string; user_id: string; role: Role; role_id: string | null; is_active: boolean; created_at: string; custom_role_name: string | null;
  can_set_branch_status: boolean; can_manage_services: boolean; can_manage_operating_hours: boolean; can_manage_team: boolean; can_manage_kiosk_display: boolean;
  can_call_customer: boolean; can_serve_customer: boolean; can_complete_ticket: boolean; can_cancel_ticket: boolean; can_mark_no_show: boolean;
  can_view_customer_contact: boolean; can_view_reports: boolean; can_export_reports: boolean; can_view_audit_logs: boolean; can_view_queue_information_editing: boolean; can_view_position_notifications: boolean;
  can_add_customer: boolean; can_edit_customer: boolean;
};
type Profile = { id: string; full_name: string | null; email: string | null; phone: string | null };
type BranchUser = { user_id: string; branch_id: string };

type EffectiveTerms = { plan_name?: string; status?: string; billing_interval?: "monthly" | "yearly"; renewal_mode?: "manual" | "auto"; current_cycle_price?: number; monthly_price?: number; max_branches?: number | null; max_active_queues_per_branch?: number | null; max_services_per_branch?: number | null; next_billing_at?: string | null; expires_at?: string | null };
function peso(value: number | string | null | undefined) { return `₱${Number(value ?? 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`; }

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="settings-new-heading"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p className="muted">{description}</p></div>;
}

export default async function SettingsPage({ searchParams }: Props) {
  const params = await searchParams;
  const pinReveal = readPinRevealToken(params.pin_reveal);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) redirect("/auth/login?next=%2Fdashboard%2Fsettings");

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, role, can_manage_branches, can_manage_settings, can_view_queue_information_editing, can_view_position_notifications, can_set_branch_status, can_manage_services, can_manage_operating_hours, can_manage_team, can_manage_roles, can_manage_kiosk_display, businesses(name,kiosk_exit_pin_hash,terminal_theme,terminal_page_bg_color,terminal_press_bg_color,terminal_accent_color,terminal_text_color,terminal_muted_text_color,terminal_background_image_url,terminal_logo_url,terminal_background_overlay)")
    .eq("user_id", user.id).eq("is_active", true).limit(1).maybeSingle();
  if (!membership) redirect("/dashboard");

  const actorRole = membership.role as Role;
  const businessWide = actorRole === "owner" || actorRole === "admin";
  const canManageSettings = businessWide || Boolean(membership.can_manage_settings);
  const canViewQueueInformationEditing = canManageSettings || Boolean(membership.can_view_queue_information_editing);
  const canViewPositionNotifications = canManageSettings || Boolean(membership.can_view_position_notifications);
  const canManageOperatingHours = canManageSettings || Boolean(membership.can_manage_operating_hours);
  const canManageBranches = businessWide || Boolean(membership.can_manage_branches || membership.can_set_branch_status);
  const canManageServices = businessWide || Boolean(membership.can_manage_services);
  const canManageTeam = businessWide || Boolean(membership.can_manage_team);
  const canManageRoles = businessWide || Boolean(membership.can_manage_roles);
  if (!canViewQueueInformationEditing && !canViewPositionNotifications && !canManageOperatingHours && !canManageServices && !canManageTeam && !canManageRoles) redirect("/dashboard");

  const business = Array.isArray(membership.businesses) ? membership.businesses[0] : membership.businesses;
  let allowedBranchIds: string[] | null = null;
  if (!businessWide) {
    const { data: assignments } = await supabase.from("branch_users").select("branch_id").eq("user_id", user.id);
    allowedBranchIds = (assignments ?? []).map((row) => row.branch_id);
  }

  let branchQuery = supabase.from("branches")
    .select("id,name,slug,status,timezone,address,phone,terminal_theme,terminal_page_bg_color,terminal_press_bg_color,terminal_accent_color,terminal_text_color,terminal_muted_text_color,terminal_background_image_url,terminal_logo_url,terminal_background_overlay,kiosk_exit_pin_hash")
    .eq("business_id", membership.business_id).order("created_at", { ascending: true });
  if (!businessWide && allowedBranchIds) branchQuery = branchQuery.in("id", allowedBranchIds.length ? allowedBranchIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: branchesData } = await branchQuery;
  const branches = branchesData ?? [];
  const selectedBranchId = params.branch && branches.some((branch) => branch.id === params.branch) ? params.branch : branches[0]?.id;
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId);
  const branchIds = branches.map((branch) => branch.id);

  const activeView = params.view ?? (canManageBranches ? "branch-general" : canManageServices ? "services" : canManageTeam ? "users" : canManageRoles ? "roles" : canManageOperatingHours ? "branch-operating" : canViewQueueInformationEditing ? "branch-queue" : "branch-notifications");
  const viewAllowed =
    (activeView === "branch-general" && canManageBranches) ||
    (activeView === "branch-services" && canManageServices) ||
    (activeView === "branch-users" && canManageTeam) ||
    (activeView === "branch-operating" && canManageOperatingHours) ||
    (activeView === "branch-queue" && canViewQueueInformationEditing) ||
    (activeView === "branch-notifications" && canViewPositionNotifications) ||
    (["branch-appearance","branch-terminals","business","billing","android-app"].includes(activeView) && businessWide) ||
    (activeView === "services" && canManageServices) ||
    (activeView === "users" && canManageTeam) ||
    (["roles","permissions"].includes(activeView) && canManageRoles);
  if (!viewAllowed) redirect("/dashboard");
  const needsQueueConfig = ["branch-queue", "branch-notifications"].includes(activeView);
  const needsOperatingHours = activeView === "branch-operating";
  const needsNotificationRules = activeView === "branch-notifications";
  const needsServices = ["services", "branch-services", "branch-appearance", "branch-terminals"].includes(activeView);
  const needsMembers = ["users", "branch-users"].includes(activeView);
  const needsRoles = ["users", "roles", "permissions", "branch-users"].includes(activeView);
  const needsBilling = activeView === "billing";

  const selectedPromises = selectedBranchId ? Promise.all([
    needsQueueConfig ? supabase.from("queue_configurations").select("starting_number,no_show_minutes,is_active,show_branch_contact,customer_refresh_seconds,sms_notifications_enabled,sms_start_position").eq("branch_id", selectedBranchId).maybeSingle() : Promise.resolve({ data: null }),
    needsOperatingHours ? supabase.from("operating_hours").select("day_of_week,is_open,open_time,close_time").eq("branch_id", selectedBranchId).order("day_of_week", { ascending: true }) : Promise.resolve({ data: [] as never[] }),
    needsNotificationRules ? supabase.from("position_notification_rules").select("position,send_sms_once,browser_notification").eq("branch_id", selectedBranchId).order("position", { ascending: true }) : Promise.resolve({ data: [] as never[] }),
  ]) : Promise.resolve([{ data: null }, { data: [] }, { data: [] }] as const);

  const servicesPromise = needsServices ? supabase.from("business_services").select("id,name,service_group,description,queue_prefix,estimated_minutes,is_active,created_at").eq("business_id", membership.business_id).order("service_group", { ascending: true }).order("created_at", { ascending: true }) : Promise.resolve({ data: [] as never[] });
  const branchServiceLinksPromise = needsServices && branchIds.length ? supabase.from("branch_service_catalog").select("business_service_id,branch_id,service_id").in("branch_id", branchIds) : Promise.resolve({ data: [] as never[] });

  let memberQuery = supabase.from("business_users")
    .select("id,user_id,role,role_id,is_active,created_at,custom_role_name,can_set_branch_status,can_manage_services,can_manage_operating_hours,can_manage_team,can_manage_kiosk_display,can_add_customer,can_edit_customer,can_call_customer,can_serve_customer,can_complete_ticket,can_cancel_ticket,can_mark_no_show,can_view_customer_contact,can_view_reports,can_export_reports,can_view_audit_logs,can_view_queue_information_editing,can_view_position_notifications")
    .eq("business_id", membership.business_id).order("created_at", { ascending: true });
  if (!businessWide) memberQuery = memberQuery.eq("role", "staff");

  const [selectedResults, servicesResult, branchServiceLinksResult, membersResult, rolesResult, permissionsResult, rolePermissionsResult, plansResult, termsResult, ordersResult] = await Promise.all([
    selectedPromises,
    servicesPromise,
    branchServiceLinksPromise,
    needsMembers ? memberQuery : Promise.resolve({ data: [] as never[] }),
    needsRoles ? supabase.from("roles").select("id,name,description,base_role,branch_scope,is_system,is_protected").eq("business_id", membership.business_id).order("is_system", { ascending: false }).order("created_at", { ascending: true }) : Promise.resolve({ data: [] as never[] }),
    needsRoles ? supabase.from("permissions").select("code,label,description,category,sort_order").order("sort_order", { ascending: true }) : Promise.resolve({ data: [] as never[] }),
    needsRoles ? supabase.from("role_permissions").select("role_id,permission_code") : Promise.resolve({ data: [] as never[] }),
    businessWide && needsBilling ? supabase.from("plans").select("id,name,description,max_branches,price_monthly,price_yearly,currency,max_active_queues_per_branch,max_services_per_branch,allow_auto_renew,tax_mode,vat_rate,tax_price_mode").eq("is_active", true).eq("is_public", true).eq("accepts_new_subscriptions", true).order("sort_order") : Promise.resolve({ data: [] as never[] }),
    businessWide && needsBilling ? supabase.rpc("get_effective_subscription_terms", { target_business_id: membership.business_id }) : Promise.resolve({ data: null }),
    businessWide && needsBilling ? supabase.from("subscription_orders").select("id,status,amount,currency,billing_interval,renewal_mode,created_at,plans(name)").eq("business_id", membership.business_id).order("created_at", { ascending: false }).limit(5) : Promise.resolve({ data: [] as never[] }),
  ]);

  const [configResult, hoursResult, notificationRulesResult] = selectedResults;
  const config = configResult.data;
  const hours = (hoursResult.data ?? []) as Array<{ day_of_week: number; is_open: boolean; open_time: string | null; close_time: string | null }>;
  const notificationRules = (notificationRulesResult.data ?? []) as Array<{ position: number; send_sms_once: boolean; browser_notification: boolean }>;
  const hoursByDay = new Map(hours.map((row) => [row.day_of_week, row]));
  const settingsFormKey = `${selectedBranchId ?? "none"}:${params.saved ?? "initial"}`;

  const allServices = servicesResult.data ?? [];
  const branchServiceLinks = branchServiceLinksResult.data ?? [];
  const branchIdsByCatalogService = new Map<string, string[]>();
  const linksByBranch = new Map<string, typeof branchServiceLinks>();
  for (const link of branchServiceLinks) {
    const assignedBranches = branchIdsByCatalogService.get(link.business_service_id) ?? [];
    assignedBranches.push(link.branch_id);
    branchIdsByCatalogService.set(link.business_service_id, assignedBranches);
    const branchLinks = linksByBranch.get(link.branch_id) ?? [];
    branchLinks.push(link);
    linksByBranch.set(link.branch_id, branchLinks);
  }
  const serviceCatalog = allServices.map((service) => ({
    key: service.id,
    name: service.name,
    group: service.service_group ?? null,
    description: service.description,
    queue_prefix: service.queue_prefix,
    estimated_minutes: service.estimated_minutes,
    branch_ids: branchIdsByCatalogService.get(service.id) ?? [],
  }));
  const teamBranches = branches.map((branch) => ({ id: branch.id, name: branch.name, status: branch.status }));
  const roles = (rolesResult.data ?? []) as BusinessRole[];
  const roleById = new Map(roles.map((role) => [role.id, role]));
  let members = (membersResult.data ?? []) as Member[];
  members = members.map((member) => ({ ...member, custom_role_name: member.role_id ? roleById.get(member.role_id)?.name ?? member.custom_role_name : member.custom_role_name }));
  const candidateIds = members.map((member) => member.user_id);
  const [teamAssignmentsResult, profilesResult] = await Promise.all([
    branchIds.length && candidateIds.length ? supabase.from("branch_users").select("user_id,branch_id").in("branch_id", branchIds).in("user_id", candidateIds) : Promise.resolve({ data: [] as BranchUser[] }),
    candidateIds.length ? supabase.from("profiles").select("id,full_name,email,phone").in("id", candidateIds) : Promise.resolve({ data: [] as Profile[] }),
  ]);
  const teamAssignments = (teamAssignmentsResult.data ?? []) as BranchUser[];
  const teamProfiles = (profilesResult.data ?? []) as Profile[];
  const assignableRoles = roles.filter((role) => !["owner", "admin"].includes(role.base_role));
  const clientVisibleRoles = roles.filter((role) => role.base_role !== "owner");

  const serviceByCatalogId = new Map(allServices.map((service) => [service.id, service]));
  const terminalBranches = branches.map((branch) => ({
    id: branch.id,
    name: branch.name,
    services: (linksByBranch.get(branch.id) ?? [])
      .filter((link) => link.service_id)
      .map((link) => {
        const catalogService = serviceByCatalogId.get(link.business_service_id);
        return {
          id: link.service_id as string,
          name: catalogService?.name ?? "Service",
          is_active: catalogService?.is_active ?? true,
        };
      }),
  }));
  const { data: terminals } = businessWide && activeView === "branch-terminals" && branchIds.length
    ? await supabase.from("devices").select("id,name,device_token,is_active,last_seen_at,branch_id,service_id,branches(name),services(name)").in("branch_id", branchIds).eq("device_type", "ticket_terminal").order("created_at")
    : { data: [] as never[] };

  const branchGeneralPanel = selectedBranch ? (
    <div className="settings-detail-form-v2 settings-branch-general-v3">
      <form action={updateBranch} className="settings-general-form-v3">
        <input type="hidden" name="branch_id" value={selectedBranch.id} />
        <section className="settings-form-section-v2">
          <div className="settings-section-heading-v2">
            <span className="settings-section-heading-icon" aria-hidden="true">⌂</span>
            <div><p className="eyebrow">Basic Information</p><h2>Branch information</h2><p className="muted">Update branch identity, location and operating status.</p></div>
          </div>
          <div className="settings-field-panel-v2 settings-basic-grid-v3">
            <label><span>Branch name</span><input name="name" required minLength={2} maxLength={120} defaultValue={selectedBranch.name} /></label>
            <label><span>Status</span><select name="status" defaultValue={selectedBranch.status}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
            <label className="settings-field-wide-v3"><span>Address</span><input name="address" maxLength={300} defaultValue={selectedBranch.address ?? ""} placeholder="Branch address" /></label>
          </div>
        </section>
        <section className="settings-form-section-v2">
          <div className="settings-section-heading-v2">
            <span className="settings-section-heading-icon" aria-hidden="true">☎</span>
            <div><p className="eyebrow">Contact Information</p><h2>Branch contact</h2><p className="muted">Contact details shown for this branch.</p></div>
          </div>
          <div className="settings-field-panel-v2 settings-basic-grid-v3">
            <label><span>Contact number</span><DigitsOnlyInput name="phone" maxLength={20} defaultValue={selectedBranch.phone ?? ""} /></label>
          </div>
        </section>
        <div className="settings-save-bar-v2 settings-save-bar-actions-only settings-branch-action-plain"><button className="button button-primary settings-branch-action-button" type="submit">Save Changes</button></div>
      </form>

      {businessWide ? <form action={deleteBranch} className="settings-danger-zone settings-danger-zone-v3 settings-danger-action-only settings-branch-action-plain settings-delete-branch-plain"><input type="hidden" name="branch_id" value={selectedBranch.id} /><div className="settings-delete-branch-action"><ConfirmDeleteSubmit className="button button-danger settings-branch-action-button" message={`Delete ${selectedBranch.name}? This permanently removes the branch if it has no queue history.`} requireCode title="Delete branch">Delete branch</ConfirmDeleteSubmit><small>Only branches without queue history can be deleted. If this branch already has queue history, set it to inactive instead.</small></div></form> : null}
    </div>
  ) : <div className="mini-empty"><strong>No branch available.</strong><span>Create or assign a branch first.</span></div>;

  const servicesPanel = selectedBranch ? <BranchServiceAssignments branchId={selectedBranch.id} branchName={selectedBranch.name} catalog={serviceCatalog} assignedNames={branchServiceLinks.filter((link) => link.branch_id === selectedBranch.id).map((link) => link.business_service_id)} canManage={canManageServices} /> : branchGeneralPanel;
  const serviceCatalogPanel = <ServiceCatalog branches={branches.map((branch) => ({ id: branch.id, name: branch.name }))} services={serviceCatalog} canManage={canManageServices} />;

  const usersPanel = <TeamWorkspace members={members} profiles={teamProfiles} branches={teamBranches} assignments={teamAssignments} actorRole={actorRole} initialBranchId="all" businessRoles={assignableRoles} compact />;
  const branchUsersPanel = selectedBranch ? <BranchUserAssignment branchId={selectedBranch.id} branchName={selectedBranch.name} members={members.map((member) => ({ id: member.id, user_id: member.user_id, role: member.role, role_id: member.role_id, custom_role_name: member.custom_role_name, is_active: member.is_active }))} profiles={teamProfiles} assignedUserIds={teamAssignments.filter((assignment) => assignment.branch_id === selectedBranch.id).map((assignment) => assignment.user_id)} canManage={canManageTeam} businessRoles={roles.map((role: BusinessRole) => ({ id: role.id, name: role.name, branch_scope: role.branch_scope }))} allAssignments={teamAssignments} /> : branchGeneralPanel;
  const rolesPanel = <section className="settings-new-section"><RoleManagement key={params.role ?? "roles-default"} roles={clientVisibleRoles} permissions={(permissionsResult.data ?? []) as Permission[]} rolePermissions={(rolePermissionsResult.data ?? []).filter((item) => roleById.has(item.role_id))} selectedRoleId={params.role} /></section>;
  const permissionRows = (permissionsResult.data ?? []) as Permission[];
  const permissionsPanel = <section className={`settings-new-section ${accessStyles.page}`}><SectionHeading eyebrow="Users & Access" title="Permission library" description="Review every permission available to custom roles." /><div className={accessStyles.catalogGrid}>{[...new Set(permissionRows.map((permission) => permission.category))].map((category) => <article key={category} className={accessStyles.catalogGroup}><h3>{category}</h3>{permissionRows.filter((permission) => permission.category === category).map((permission) => <div className={accessStyles.catalogRow} key={permission.code}><div className={accessStyles.catalogRowCopy}><strong>{permission.label}</strong><span>{permission.description}</span></div><span className={accessStyles.permissionAvailable}>Available</span></div>)}</article>)}</div></section>;

  const hiddenBaseQueueSettings = selectedBranchId && selectedBranch ? <>
    <input type="hidden" name="branch_id" value={selectedBranchId} />
    <input type="hidden" name="starting_number" value={config?.starting_number ?? 1} />
    <input type="hidden" name="no_show_minutes" value={config?.no_show_minutes ?? 5} />
    <input type="hidden" name="timezone" value={selectedBranch.timezone ?? "Asia/Manila"} />
    {config?.is_active ?? true ? <input type="hidden" name="is_active" value="on" /> : null}
    {config?.show_branch_contact ?? true ? <input type="hidden" name="show_branch_contact" value="on" /> : null}
  </> : null;

  const hiddenHours = <div style={{ display: "none" }}>{DAYS.map((day) => { const row = hoursByDay.get(day.value); const isOpen = row?.is_open ?? true; return <span key={`hidden-hours-${day.value}`}>{isOpen ? <input type="hidden" name={`day_${day.value}_open`} value="on" /> : null}<input type="hidden" name={`day_${day.value}_open_time`} value={(row?.open_time ?? "00:00").slice(0, 5)} /><input type="hidden" name={`day_${day.value}_close_time`} value={(row?.close_time ?? "23:59").slice(0, 5)} /></span>; })}</div>;
  const hiddenRules = <><input type="hidden" name="position_rule_count" value={notificationRules.length} />{notificationRules.map((rule, index) => <span key={`hidden-rule-${rule.position}`} style={{ display: "none" }}><input type="hidden" name={`position_rule_${index}_position`} value={rule.position} />{rule.send_sms_once ? <input type="hidden" name={`position_rule_${index}_sms`} value="on" /> : null}{rule.browser_notification ? <input type="hidden" name={`position_rule_${index}_browser`} value="on" /> : null}</span>)}</>;

  const queuePanel = selectedBranchId && selectedBranch ? <form key={`${settingsFormKey}:queue`} action={updateQueueSettings} className="settings-detail-form-v2"><input type="hidden" name="return_view" value="branch-queue" />{hiddenBaseQueueSettings}<input type="hidden" name="sms_start_position" value={config?.sms_start_position ?? 3} />{config?.sms_notifications_enabled ? <input type="hidden" name="sms_notifications_enabled" value="on" /> : null}{hiddenHours}{hiddenRules}<section id="queue-rules" className="settings-form-section-v2"><div className="settings-section-heading-v2"><span className="settings-section-heading-icon">☷</span><div><p className="eyebrow">Queue Settings</p><h2>Customer status refresh</h2><p className="muted">Control how quickly scanned stub pages refresh queue position.</p></div></div><div className="settings-field-panel-v2"><label className="settings-field-v2"><span>Refresh every</span><span className="settings-input-with-suffix"><input name="customer_refresh_seconds" type="number" min={3} max={300} step={1} defaultValue={config?.customer_refresh_seconds ?? 8} /><small>seconds</small></span><small>Recommended: 5–10 seconds for responsive customer status updates.</small></label></div></section><div className="settings-save-bar-v2"><div><strong>Queue Settings</strong><small>Save queue behavior for this branch.</small></div><SettingsSaveGuard branchName={selectedBranch.name} /></div></form> : branchGeneralPanel;

  const notificationsPanel = selectedBranchId && selectedBranch ? <form key={`${settingsFormKey}:notifications`} action={updateQueueSettings} className="settings-detail-form-v2"><input type="hidden" name="return_view" value="branch-notifications" />{hiddenBaseQueueSettings}<input type="hidden" name="customer_refresh_seconds" value={config?.customer_refresh_seconds ?? 8} />{hiddenHours}<section id="notifications" className="settings-form-section-v2"><div className="settings-section-heading-v2"><span className="settings-section-heading-icon">♢</span><div><p className="eyebrow">Notifications</p><h2>Queue position updates</h2><p className="muted">Configure SMS and browser notifications for each position.</p></div></div><div className="settings-field-panel-v2 settings-field-panel-stack-v2"><PositionRules key={`${selectedBranchId}:${params.saved ?? "initial"}:position-rules`} initialRules={notificationRules.map((rule) => ({ position: rule.position, send_sms_once: rule.send_sms_once, browser_notification: rule.browser_notification }))} /></div></section><div className="settings-save-bar-v2"><div><strong>Notifications</strong><small>Save notification rules for this branch.</small></div><SettingsSaveGuard branchName={selectedBranch.name} /></div></form> : branchGeneralPanel;

  const operatingPanel = selectedBranchId && selectedBranch ? <form key={`${settingsFormKey}:operating`} action={updateQueueSettings} className="settings-detail-form-v2"><input type="hidden" name="return_view" value="branch-operating" />{hiddenBaseQueueSettings}<input type="hidden" name="customer_refresh_seconds" value={config?.customer_refresh_seconds ?? 8} /><input type="hidden" name="sms_start_position" value={config?.sms_start_position ?? 3} />{config?.sms_notifications_enabled ? <input type="hidden" name="sms_notifications_enabled" value="on" /> : null}{hiddenRules}<section id="operating-hours" className="settings-form-section-v2"><div className="settings-section-heading-v2"><span className="settings-section-heading-icon">◷</span><div><p className="eyebrow">Operating Hours</p><h2>Weekly schedule</h2><p className="muted">Control when customers can issue new stubs.</p></div></div><div className="hours-list settings-hours-v2">{DAYS.map((day) => { const row = hoursByDay.get(day.value); const isOpen = row?.is_open ?? true; return <div className="hours-row" key={day.value}><label className="hours-day"><input type="checkbox" name={`day_${day.value}_open`} defaultChecked={isOpen} /><strong>{day.label}</strong></label><label>Open<input type="time" name={`day_${day.value}_open_time`} defaultValue={(row?.open_time ?? "00:00").slice(0, 5)} /></label><label>Close<input type="time" name={`day_${day.value}_close_time`} defaultValue={(row?.close_time ?? "23:59").slice(0, 5)} /></label></div>; })}</div></section><div className="settings-save-bar-v2"><div><strong>Operating Hours</strong><small>Save this branch weekly schedule.</small></div><SettingsSaveGuard branchName={selectedBranch.name} /></div></form> : branchGeneralPanel;

  const previewServiceName = selectedBranchId
    ? branchServiceLinks.map((link) => link.branch_id === selectedBranchId ? serviceByCatalogId.get(link.business_service_id)?.name : null).find(Boolean) ?? "Service preview"
    : "Service preview";
  const appearancePanel = selectedBranchId && selectedBranch && businessWide ? <section id="terminal-appearance" className="settings-new-section settings-anchor-section"><SectionHeading eyebrow="Appearance" title="Terminal appearance" description="Customize this branch kiosk and terminal presentation." /><TerminalAppearanceForm action={updateTerminalAppearance} businessId={membership.business_id} businessName={business?.name ?? "Your Business"} branchId={selectedBranchId} branchName={selectedBranch.name} previewServiceName={previewServiceName} canApplyAll={businessWide} appearance={{ terminal_theme: selectedBranch.terminal_theme ?? business?.terminal_theme, terminal_page_bg_color: selectedBranch.terminal_page_bg_color ?? business?.terminal_page_bg_color, terminal_press_bg_color: selectedBranch.terminal_press_bg_color ?? business?.terminal_press_bg_color, terminal_accent_color: selectedBranch.terminal_accent_color ?? business?.terminal_accent_color, terminal_text_color: selectedBranch.terminal_text_color ?? business?.terminal_text_color, terminal_muted_text_color: selectedBranch.terminal_muted_text_color ?? business?.terminal_muted_text_color, terminal_background_image_url: selectedBranch.terminal_background_image_url ?? business?.terminal_background_image_url, terminal_logo_url: selectedBranch.terminal_logo_url ?? business?.terminal_logo_url, terminal_background_overlay: selectedBranch.terminal_background_overlay ?? business?.terminal_background_overlay }} /></section> : branchGeneralPanel;

  const selectedTerminalBranches = selectedBranch ? terminalBranches.filter((branch) => branch.id === selectedBranch.id) : [];
  const selectedTerminals = selectedBranchId ? (terminals ?? []).filter((terminal) => terminal.branch_id === selectedBranchId) : [];
  const terminalsPanel = businessWide && selectedBranch ? <section className="settings-new-section">
    <SectionHeading eyebrow="Branch · Stub Printer" title={`${selectedBranch.name} stub printers`} description="Create and manage the Android stub printers assigned to this branch." />
    {pinReveal ? <div className="terminal-pin-reveal" role="status"><div><strong>{pinReveal.terminalName} created</strong><span>Terminal PIN — save it now. This is shown only once.</span></div><code>{pinReveal.pin}</code></div> : null}
    <div className="settings-terminal-create"><h3>Add stub printer</h3><CreateTerminalForm branches={selectedTerminalBranches} submitLabel="Create stub printer" defaultBranchId={selectedBranch.id} hideBranchSelect /></div>
    <div className="terminal-list">{selectedTerminals.map((terminal) => { const branch = Array.isArray(terminal.branches) ? terminal.branches[0] : terminal.branches; const service = Array.isArray(terminal.services) ? terminal.services[0] : terminal.services; return <article className="settings-terminal-row" key={terminal.id}><div><strong>{terminal.name}</strong><span>{branch?.name ?? selectedBranch.name} · {service?.name ?? "No service"}</span><small>{terminal.last_seen_at ? `Last seen ${new Date(terminal.last_seen_at).toLocaleString()}` : "Not connected yet"}</small><div className="terminal-token-panel"><span>Device token for Android APK</span><code>{terminal.device_token}</code><CopyTokenButton token={terminal.device_token} /></div></div><details><summary>Edit assignment</summary><TerminalForm branches={selectedTerminalBranches} action={updateTerminal} submitLabel="Save assignment" terminalId={terminal.id} defaultName={terminal.name} defaultBranchId={selectedBranch.id} defaultServiceId={terminal.service_id ?? ""} compact hideBranchSelect /></details><div className="settings-terminal-actions"><a className="button button-secondary" href={`/kiosk/${terminal.device_token}?from=dashboard`}>Open Terminal</a><form action={deleteTerminal}><input type="hidden" name="id" value={terminal.id} /><ConfirmDeleteSubmit className="button button-danger" message={`Remove terminal ${terminal.name}? This action cannot be undone.`}>Remove</ConfirmDeleteSubmit></form></div></article>; })}</div>
  </section> : branchGeneralPanel;

  const businessPanel = <section className="settings-new-section settings-business-profile-section"><SectionHeading eyebrow="Business" title="Business profile" description="Manage the business identity used across QueueDrop." /><form action={updateBusinessProfile} className="settings-business-edit-form"><label>Business name<input name="business_name" defaultValue={business?.name ?? "QueueDrop"} minLength={2} maxLength={120} required /></label><button className="button button-primary" type="submit">Save business</button></form><div className="settings-business-summary settings-business-summary-compact"><div><span>Business ID</span><code>{membership.business_id}</code></div><div><span>Account role</span><strong>{actorRole}</strong></div><div><span>Branches</span><strong>{branches.length}</strong></div></div></section>;

  const terms = (termsResult.data ?? null) as EffectiveTerms | null;
  const billingPanel = businessWide ? <section className="settings-new-section"><SectionHeading eyebrow="Billing & Subscription" title="Plan & billing" description="Review your current plan and change subscription without opening the old client page." /><div className="settings-billing-summary"><div><span>Current plan</span><strong>{terms?.plan_name ?? "No active subscription"}</strong></div><div><span>Status</span><strong>{terms?.status ?? "—"}</strong></div><div><span>Billing cycle</span><strong>{terms?.billing_interval === "yearly" ? "Annual" : "Monthly"}</strong></div><div><span>Current cycle</span><strong>{peso(terms?.current_cycle_price ?? terms?.monthly_price)}</strong></div></div><div className="settings-plan-list">{(plansResult.data ?? []).map((plan) => <article key={plan.id} className="settings-plan-row"><div><strong>{plan.name}</strong><span>{plan.description}</span><small>{peso(plan.price_monthly)}/month{plan.price_yearly ? ` · ${peso(plan.price_yearly)}/year` : ""}</small></div><form action={startSubscriptionCheckout}><input type="hidden" name="plan_id" value={plan.id} /><select name="billing_interval" defaultValue="monthly"><option value="monthly">Monthly</option>{plan.price_yearly ? <option value="yearly">Annual</option> : null}</select><select name="renewal_mode" defaultValue="manual"><option value="manual">Manual renewal</option>{plan.allow_auto_renew ? <option value="auto">Auto-renew</option> : null}</select><button className="button button-primary" type="submit">Choose plan</button></form></article>)}</div><div className="settings-recent-orders"><h3>Recent billing activity</h3>{(ordersResult.data ?? []).map((order) => { const relation = order.plans; const plan = Array.isArray(relation) ? relation[0] : relation; return <div key={order.id} className="settings-order-row"><span>{plan?.name ?? "Plan"} · {order.billing_interval}</span><strong>{order.status}</strong></div>; })}</div></section> : null;

  const isTestInstaller = process.env.VERCEL_ENV === "preview" && process.env.VERCEL_GIT_COMMIT_REF === "test";
  const installerVersion = isTestInstaller ? "1.1.1 TEST" : "1.1.0";
  const installerHref = isTestInstaller ? "/installers/QueueDrop-PrintBridge-v1.1.1-test.apk" : "/installers/QueueDrop-PrintBridge-v1.1.0-debug.apk";
  const installerDownload = isTestInstaller ? "QueueDrop-PrintBridge-v1.1.1-test.apk" : "QueueDrop-PrintBridge-v1.1.0.apk";
  const androidAppPanel = businessWide ? <section className="settings-new-section"><SectionHeading eyebrow="Mobile Installers" title="QueueDrop mobile installers" description="Download the latest QueueDrop installer for a compatible Android device." /><div className="settings-field-panel-v2"><div className="settings-apk-download"><div><strong>QueueDrop Print Bridge v{installerVersion}</strong><p className="muted">{isTestInstaller ? "TEST installer for queuedrop-test.vercel.app. Install alongside your existing QueueDrop app." : "Install the approved Android APK for your QueueDrop stub printer."}</p></div><a className="button button-primary" href={installerHref} download={installerDownload}>Download Mobile Installer</a></div></div></section> : null;

  const addBranchPanel = businessWide ? (
    <details className="settings-add-branch-panel-v4">
      <summary><span className="settings-add-branch-plus">＋</span><span className="settings-add-branch-open-label">Add branch</span><span className="settings-add-branch-cancel-label">Cancel</span></summary>
      <form action={createBranch} className="settings-add-branch-form-v4">
        <label>Branch name<input name="name" required minLength={2} maxLength={120} placeholder="New branch" /></label>
        <label>Address<input name="address" maxLength={300} placeholder="Branch address" /></label>
        <label>Contact number<DigitsOnlyInput name="phone" maxLength={20} placeholder="09XXXXXXXXX" /></label>
        <label className="settings-duplicate-select-v4"><span>Duplicate settings from</span><select name="source_branch_id" defaultValue=""><option value="">Start with default settings</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><small>Optional. Copies services, operating hours, queue rules, notifications and appearance. Users and terminals are not copied.</small></label>
        <PendingSubmitButton idle="Create branch" pending="Saving branch…" />
      </form>
    </details>
  ) : null;

  return <>
    <PreserveDashboardScroll />
    <DashboardResultModal success={params.message} error={params.error} />
    <section className="dashboard-content settings-page settings-page-unified">
      <header className="dashboard-header settings-page-unified-header"><div><h1>Settings</h1><p className="muted page-lead">Manage your business, branches, services, users and more from one workspace.</p></div>{process.env.VERCEL_ENV === "production" ? null : <span className="env-badge">TEST</span>}</header>
      <SettingsUnifiedConsole
        key={`${selectedBranchId ?? "none"}:${activeView}`}
        branches={branches.map((branch) => ({ id: branch.id, name: branch.name, address: branch.address, status: branch.status }))}
        initialBranchId={selectedBranchId}
        initialView={activeView}
        canManageBranches={canManageBranches}
        canManageServices={canManageServices}
        canManageTeam={canManageTeam}
        canManageRoles={canManageRoles}
        canManageOperatingHours={canManageOperatingHours}
        canViewPositionNotifications={canViewPositionNotifications}
        businessWide={businessWide}
        addBranchPanel={addBranchPanel}
        panels={{
          "branch-general": branchGeneralPanel,
          "branch-services": servicesPanel,
          "branch-users": branchUsersPanel,
          "branch-operating": operatingPanel,
          "branch-queue": queuePanel,
          "branch-notifications": notificationsPanel,
          "branch-appearance": appearancePanel,
          "branch-terminals": terminalsPanel,
          services: serviceCatalogPanel,
          users: usersPanel,
          roles: rolesPanel,
          permissions: permissionsPanel,
          business: businessPanel,
          billing: billingPanel,
          "android-app": androidAppPanel,
        }}
      />
    </section>
  </>;
}
