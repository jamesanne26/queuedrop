import { redirect } from "next/navigation";
import { DashboardResultModal } from "@/app/dashboard/_components/dashboard-result-modal";
import { PreserveDashboardScroll } from "@/app/dashboard/_components/preserve-dashboard-scroll";
import { createClient } from "@/lib/supabase/server";
import { TeamWorkspace } from "./team-workspace";

type Props = {
  searchParams: Promise<{
    message?: string;
    error?: string;
    branch?: string;
  }>;
};

type Role = "owner" | "admin" | "manager" | "staff";
type Member = { id: string; user_id: string; role: Role; is_active: boolean; created_at: string };
type Profile = { id: string; full_name: string | null; email: string | null; phone: string | null };
type Branch = { id: string; name: string; status: string };
type BranchUser = { user_id: string; branch_id: string };

export default async function TeamPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/auth/login?next=%2Fdashboard%2Fteam");

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, role, businesses(name)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  const actorRole = membership.role as Role;
  if (!["owner", "admin", "manager"].includes(actorRole)) redirect("/dashboard");

  const business = Array.isArray(membership.businesses)
    ? membership.businesses[0]
    : membership.businesses;

  const isManager = actorRole === "manager";

  const { data: actorAssignments } = isManager
    ? await supabase.from("branch_users").select("branch_id").eq("user_id", user.id)
    : { data: [] as { branch_id: string }[] };

  const managerBranchIds = (actorAssignments ?? []).map((row) => row.branch_id);

  let branchQuery = supabase
    .from("branches")
    .select("id, name, status")
    .eq("business_id", membership.business_id)
    .order("created_at", { ascending: true });

  if (isManager) {
    branchQuery = branchQuery.in(
      "id",
      managerBranchIds.length ? managerBranchIds : ["00000000-0000-0000-0000-000000000000"],
    );
  }

  let memberQuery = supabase
    .from("business_users")
    .select("id, user_id, role, is_active, created_at")
    .eq("business_id", membership.business_id)
    .order("created_at", { ascending: true });

  if (isManager) memberQuery = memberQuery.eq("role", "staff");

  const [{ data: branches }, { data: rawMembers }] = await Promise.all([branchQuery, memberQuery]);

  const visibleBranches = (branches ?? []) as Branch[];
  const visibleBranchIds = visibleBranches.map((branch) => branch.id);
  let members = (rawMembers ?? []) as Member[];
  const candidateUserIds = members.map((member) => member.user_id);

  const [assignmentsResult, profilesResult] = await Promise.all([
    visibleBranchIds.length && candidateUserIds.length
      ? supabase
          .from("branch_users")
          .select("user_id, branch_id")
          .in("branch_id", visibleBranchIds)
          .in("user_id", candidateUserIds)
      : Promise.resolve({ data: [] as BranchUser[] }),
    candidateUserIds.length
      ? supabase.from("profiles").select("id, full_name, email, phone").in("id", candidateUserIds)
      : Promise.resolve({ data: [] as Profile[] }),
  ]);

  const assignments = (assignmentsResult.data ?? []) as BranchUser[];

  if (isManager) {
    const visibleStaffIds = new Set(assignments.map((assignment) => assignment.user_id));
    members = members.filter((member) => visibleStaffIds.has(member.user_id));
  }

  const visibleMemberIds = new Set(members.map((member) => member.user_id));
  const profiles = ((profilesResult.data ?? []) as Profile[]).filter((profile) => visibleMemberIds.has(profile.id));

  const initialBranchId =
    params.branch && visibleBranches.some((branch) => branch.id === params.branch)
      ? params.branch
      : "all";

  return (
    <>
      <PreserveDashboardScroll />
      <DashboardResultModal success={params.message} error={params.error} />
      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Team & access</p>
            <h1>{business?.name ?? "QueueDrop"}</h1>
            <p className="muted page-lead">
              {isManager
                ? "Managers can manage staff only in their assigned branches. Every staff account belongs to exactly one branch."
                : "Owners/admins can manage managers and staff. Staff belongs to exactly one branch; managers may manage one or more branches."}
            </p>
          </div>
          <span className="env-badge">TEST</span>
        </header>

        <TeamWorkspace
          members={members}
          profiles={profiles}
          branches={visibleBranches}
          assignments={assignments}
          actorRole={actorRole}
          initialBranchId={initialBranchId}
        />
      </section>
    </>
  );
}
