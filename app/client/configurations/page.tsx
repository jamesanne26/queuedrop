import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardResultModal } from "@/app/dashboard/_components/dashboard-result-modal";
import { createClient } from "@/lib/supabase/server";
import { ConfigurationUsers, type ConfigurationUser } from "./configuration-users";

type Props = { searchParams: Promise<{ message?: string; error?: string }> };
type Role = "owner" | "admin" | "manager" | "staff";

type Member = {
  user_id: string;
  role: Role;
  custom_role_name: string | null;
  is_active: boolean;
  can_view_queue_information_editing: boolean;
  can_view_position_notifications: boolean;
  can_set_branch_status: boolean;
  can_manage_services: boolean;
  can_manage_operating_hours: boolean;
  can_manage_team: boolean;
  can_manage_kiosk_display: boolean;
  can_call_customer: boolean;
  can_serve_customer: boolean;
  can_complete_ticket: boolean;
  can_cancel_ticket: boolean;
  can_mark_no_show: boolean;
  can_view_customer_contact: boolean;
  can_view_reports: boolean;
  can_export_reports: boolean;
  can_view_audit_logs: boolean;
};

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

type Branch = { id: string; name: string };
type BranchUser = { user_id: string; branch_id: string };

export default async function ClientConfigurationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/login?next=%2Fclient%2Fconfigurations");

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, role, businesses(name)")
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!membership || !["owner", "admin"].includes(membership.role)) redirect("/dashboard");

  const [membersResult, branchesResult] = await Promise.all([
    supabase
      .from("business_users")
      .select("user_id, role, custom_role_name, is_active, can_view_queue_information_editing, can_view_position_notifications, can_set_branch_status, can_manage_services, can_manage_operating_hours, can_manage_team, can_manage_kiosk_display, can_call_customer, can_serve_customer, can_complete_ticket, can_cancel_ticket, can_mark_no_show, can_view_customer_contact, can_view_reports, can_export_reports, can_view_audit_logs")
      .eq("business_id", membership.business_id)
      .order("created_at", { ascending: true }),
    supabase
      .from("branches")
      .select("id, name")
      .eq("business_id", membership.business_id)
      .order("name", { ascending: true }),
  ]);

  if (membersResult.error) {
    redirect(`/client/configurations?error=${encodeURIComponent(membersResult.error.message)}`);
  }

  const members = (membersResult.data ?? []) as Member[];
  const branches = (branchesResult.data ?? []) as Branch[];
  const userIds = members.map((member) => member.user_id);

  const [profilesResult, branchUsersResult] = userIds.length
    ? await Promise.all([
        supabase.from("profiles").select("id, full_name, email, phone").in("id", userIds),
        supabase.from("branch_users").select("user_id, branch_id").in("user_id", userIds),
      ])
    : [{ data: [] as Profile[] }, { data: [] as BranchUser[] }];

  const profiles = new Map(((profilesResult.data ?? []) as Profile[]).map((profile) => [profile.id, profile]));
  const branchAssignments = new Map<string, string[]>();
  for (const assignment of (branchUsersResult.data ?? []) as BranchUser[]) {
    const current = branchAssignments.get(assignment.user_id) ?? [];
    current.push(assignment.branch_id);
    branchAssignments.set(assignment.user_id, current);
  }

  const users: ConfigurationUser[] = members.map((member) => {
    const profile = profiles.get(member.user_id);
    return {
      userId: member.user_id,
      fullName: profile?.full_name ?? "",
      email: profile?.email ?? "",
      phone: profile?.phone ?? "",
      role: member.role,
      roleName: member.custom_role_name || (member.role === "owner" ? "Owner" : member.role === "admin" ? "Admin" : "Team member"),
      isActive: member.is_active,
      branchIds: branchAssignments.get(member.user_id) ?? [],
      canViewQueueInformationEditing: member.can_view_queue_information_editing,
      canViewPositionNotifications: member.can_view_position_notifications,
      canSetBranchStatus: member.can_set_branch_status,
      canManageServices: member.can_manage_services,
      canManageOperatingHours: member.can_manage_operating_hours,
      canManageTeam: member.can_manage_team,
      canManageKioskDisplay: member.can_manage_kiosk_display,
      canCallCustomer: member.can_call_customer,
      canServeCustomer: member.can_serve_customer,
      canCompleteTicket: member.can_complete_ticket,
      canCancelTicket: member.can_cancel_ticket,
      canMarkNoShow: member.can_mark_no_show,
      canViewCustomerContact: member.can_view_customer_contact,
      canViewReports: member.can_view_reports,
      canExportReports: member.can_export_reports,
      canViewAuditLogs: member.can_view_audit_logs,
      isCurrentUser: member.user_id === userData.user.id,
    };
  });

  const business = Array.isArray(membership.businesses) ? membership.businesses[0] : membership.businesses;

  return (
    <>
      <DashboardResultModal success={params.message} error={params.error} />
      <section className="client-content">
        <div className="client-page-heading">
          <div>
            <p className="eyebrow">Configurations</p>
            <h1>{business?.name ?? "QueueDrop"}</h1>
            <p className="muted page-lead">View every business user, their role, and the configuration access assigned to them.</p>
          </div>
          <Link href="/client" className="button button-secondary">Settings</Link>
        </div>

        <section className="client-config-card">
          <div className="client-config-title">
            <h2>Users and configuration access</h2>
            <p className="muted">Use the settings button to update account details, branch assignment, configuration access, or delete eligible users. Declared employee roles are managed under Team & Roles.</p>
          </div>
          <ConfigurationUsers users={users} branches={branches} />
        </section>
      </section>
    </>
  );
}
