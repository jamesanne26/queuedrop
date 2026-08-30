import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardResultModal } from "@/app/dashboard/_components/dashboard-result-modal";
import { PreserveDashboardScroll } from "@/app/dashboard/_components/preserve-dashboard-scroll";
import { createClient } from "@/lib/supabase/server";
import { RoleManagement } from "./role-management";
import accessStyles from "./team-access.module.css";
import { TeamWorkspace } from "./team-workspace";

type Props = {
  searchParams: Promise<{
    message?: string;
    error?: string;
    branch?: string;
    tab?: "employees" | "roles" | "permissions";
    role?: string;
  }>;
};

type Role = "owner" | "admin" | "manager" | "staff";
type Member = {
  id: string; user_id: string; role: Role; role_id: string | null; is_active: boolean; created_at: string; custom_role_name: string | null;
  can_set_branch_status: boolean; can_manage_services: boolean; can_manage_operating_hours: boolean; can_manage_team: boolean;
  can_manage_kiosk_display: boolean; can_add_customer: boolean; can_edit_customer: boolean; can_call_customer: boolean;
  can_serve_customer: boolean; can_complete_ticket: boolean; can_cancel_ticket: boolean; can_mark_no_show: boolean;
  can_view_customer_contact: boolean; can_view_reports: boolean; can_export_reports: boolean; can_view_audit_logs: boolean;
  can_view_queue_information_editing: boolean; can_view_position_notifications: boolean;
};
type Profile = { id: string; full_name: string | null; email: string | null; phone: string | null };
type Branch = { id: string; name: string; status: string };
type BranchUser = { user_id: string; branch_id: string };
type BusinessRole = {
  id: string; name: string; description: string | null; base_role: Role;
  branch_scope: "own_branch_only" | "selected_branches" | "all_branches";
  is_system: boolean; is_protected: boolean;
};
type Permission = { code: string; label: string; description: string | null; category: string; sort_order: number };

export default async function TeamPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/auth/login?next=%2Fdashboard%2Fteam");

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, role, can_manage_team, can_manage_roles, businesses(name)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  const actorRole = membership.role as Role;
  const businessWide = actorRole === "owner" || actorRole === "admin";
  const canManageTeam = businessWide || Boolean(membership.can_manage_team);
  const canManageRoles = businessWide || Boolean(membership.can_manage_roles);
  if (!canManageTeam && !canManageRoles) redirect("/dashboard");

  const business = Array.isArray(membership.businesses) ? membership.businesses[0] : membership.businesses;
  const requestedTab = params.tab ?? "employees";
  const activeTab = requestedTab === "roles" || requestedTab === "permissions"
    ? (canManageRoles ? requestedTab : "employees")
    : "employees";

  const delegatedManager = !businessWide;
  const { data: actorAssignments } = delegatedManager
    ? await supabase.from("branch_users").select("branch_id").eq("user_id", user.id)
    : { data: [] as { branch_id: string }[] };
  const managerBranchIds = (actorAssignments ?? []).map((row) => row.branch_id);

  let branchQuery = supabase
    .from("branches")
    .select("id, name, status")
    .eq("business_id", membership.business_id)
    .order("created_at", { ascending: true });
  if (delegatedManager) {
    branchQuery = branchQuery.in("id", managerBranchIds.length ? managerBranchIds : ["00000000-0000-0000-0000-000000000000"]);
  }

  let memberQuery = supabase
    .from("business_users")
    .select("id, user_id, role, role_id, is_active, created_at, custom_role_name, can_set_branch_status, can_manage_services, can_manage_operating_hours, can_manage_team, can_manage_kiosk_display, can_add_customer, can_edit_customer, can_call_customer, can_serve_customer, can_complete_ticket, can_cancel_ticket, can_mark_no_show, can_view_customer_contact, can_view_reports, can_export_reports, can_view_audit_logs, can_view_queue_information_editing, can_view_position_notifications")
    .eq("business_id", membership.business_id)
    .order("created_at", { ascending: true });
  if (delegatedManager) memberQuery = memberQuery.eq("role", "staff");

  const [branchesResult, membersResult, rolesResult, permissionsResult, rolePermissionsResult] = await Promise.all([
    branchQuery,
    memberQuery,
    supabase.from("roles").select("id, name, description, base_role, branch_scope, is_system, is_protected").eq("business_id", membership.business_id).order("is_system", { ascending: false }).order("created_at", { ascending: true }),
    supabase.from("permissions").select("code, label, description, category, sort_order").order("sort_order", { ascending: true }),
    supabase.from("role_permissions").select("role_id, permission_code"),
  ]);

  const visibleBranches = (branchesResult.data ?? []) as Branch[];
  const visibleBranchIds = visibleBranches.map((branch) => branch.id);
  const businessRoles = (rolesResult.data ?? []) as BusinessRole[];
  // The business owner is an account authority, not an employee role the client needs to manage.
  // Keep it in the database for access control, but hide it from the client-facing Roles UI.
  const clientVisibleRoles = businessRoles.filter((role) => role.base_role !== "owner");
  const roleById = new Map(businessRoles.map((role) => [role.id, role]));
  let members = (membersResult.data ?? []) as Member[];
  members = members.map((member) => ({ ...member, custom_role_name: member.role_id ? roleById.get(member.role_id)?.name ?? member.custom_role_name : member.custom_role_name }));
  const candidateUserIds = members.map((member) => member.user_id);

  const [assignmentsResult, profilesResult] = await Promise.all([
    visibleBranchIds.length && candidateUserIds.length
      ? supabase.from("branch_users").select("user_id, branch_id").in("branch_id", visibleBranchIds).in("user_id", candidateUserIds)
      : Promise.resolve({ data: [] as BranchUser[] }),
    candidateUserIds.length
      ? supabase.from("profiles").select("id, full_name, email, phone").in("id", candidateUserIds)
      : Promise.resolve({ data: [] as Profile[] }),
  ]);

  const assignments = (assignmentsResult.data ?? []) as BranchUser[];
  if (delegatedManager) {
    const visibleStaffIds = new Set(assignments.map((assignment) => assignment.user_id));
    members = members.filter((member) => visibleStaffIds.has(member.user_id));
  }
  const visibleMemberIds = new Set(members.map((member) => member.user_id));
  const profiles = ((profilesResult.data ?? []) as Profile[]).filter((profile) => visibleMemberIds.has(profile.id));

  const initialBranchId = params.branch && visibleBranches.some((branch) => branch.id === params.branch)
    ? params.branch
    : visibleBranches.length === 1
      ? visibleBranches[0].id
      : "all";
  const assignableRoles = businessRoles.filter((role) => !["owner", "admin"].includes(role.base_role));

  return (
    <>
      <PreserveDashboardScroll />
      <DashboardResultModal success={params.message} error={params.error} />
      <section className={`dashboard-content ${accessStyles.page}`}>
        <header className="dashboard-header team-page-header">
          <div>
            <p className="eyebrow">Settings · {business?.name ?? "QueueDrop"}</p>
            <h1>Team & Roles</h1>
            <p className="muted page-lead">Manage employees separately from reusable business roles. Assign a role to an employee; permissions on that role determine the employee&apos;s authority.</p>
          </div>
          <span className="env-badge">TEST</span>
        </header>

        <nav className={accessStyles.tabs} aria-label="Team and roles sections">
          <Link className={`${accessStyles.tab} ${activeTab === "employees" ? accessStyles.tabActive : ""}`} href="/dashboard/team?tab=employees">Employees</Link>
          {canManageRoles ? <Link className={`${accessStyles.tab} ${activeTab === "roles" ? accessStyles.tabActive : ""}`} href="/dashboard/team?tab=roles">Roles</Link> : null}
          {canManageRoles ? <Link className={`${accessStyles.tab} ${activeTab === "permissions" ? accessStyles.tabActive : ""}`} href="/dashboard/team?tab=permissions">Permissions</Link> : null}
        </nav>

        {activeTab === "employees" ? (
          <TeamWorkspace
            members={members}
            profiles={profiles}
            branches={visibleBranches}
            assignments={assignments}
            actorRole={actorRole}
            initialBranchId={initialBranchId}
            businessRoles={assignableRoles}
          />
        ) : null}

        {activeTab === "roles" ? (
          <RoleManagement
            roles={clientVisibleRoles}
            permissions={(permissionsResult.data ?? []) as Permission[]}
            rolePermissions={(rolePermissionsResult.data ?? []).filter((item) => roleById.has(item.role_id))}
            selectedRoleId={params.role}
          />
        ) : null}

        {activeTab === "permissions" ? (
          <section className={accessStyles.catalog}>
            <div className={accessStyles.toolbar}>
              <div className={accessStyles.toolbarCopy}><p className={accessStyles.eyebrow}>Access capabilities</p><h2>Permission Library</h2><p>Reference the permissions you can assign to custom roles. Permission codes stay internal to QueueDrop.</p></div>
            </div>
            <div className={accessStyles.catalogGrid}>
              {[...new Set(((permissionsResult.data ?? []) as Permission[]).map((permission) => permission.category))].map((category) => (
                <article key={category} className={accessStyles.catalogGroup}>
                  <h3>{category}</h3>
                  {((permissionsResult.data ?? []) as Permission[]).filter((permission) => permission.category === category).map((permission) => (
                    <div className={accessStyles.catalogRow} key={permission.code}><div className={accessStyles.catalogRowCopy}><strong>{permission.label}</strong><span>{permission.description}</span></div><span className={accessStyles.permissionAvailable}>Available</span></div>
                  ))}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </>
  );
}
