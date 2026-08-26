import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardResultModal } from "@/app/dashboard/_components/dashboard-result-modal";
import { ResponsiveBranchSelect } from "@/app/dashboard/_components/responsive-branch-select";
import { PreserveDashboardScroll } from "@/app/dashboard/_components/preserve-dashboard-scroll";
import { createClient } from "@/lib/supabase/server";
import { createTeamMember } from "./actions";
import { TeamCreateFields } from "./team-forms";
import { TeamMemberEditModal } from "./team-member-edit-modal";

type Props = {
  searchParams: Promise<{
    message?: string;
    error?: string;
    branch?: string;
  }>;
};

type Role = "owner" | "admin" | "manager" | "staff";

type Member = {
  id: string;
  user_id: string;
  role: Role;
  is_active: boolean;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

type Branch = {
  id: string;
  name: string;
  status: string;
};

type BranchUser = {
  user_id: string;
  branch_id: string;
};

function visibleEmail(email: string | null) {
  if (!email) return null;
  const normalized = email.toLowerCase();
  if (normalized.startsWith("phone-") && normalized.endsWith("@auth.queuedrop.invalid")) {
    return null;
  }
  return email;
}

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
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  const actorRole = membership.role as Role;
  if (!["owner", "admin", "manager"].includes(actorRole)) {
    redirect("/dashboard");
  }

  const business = Array.isArray(membership.businesses)
    ? membership.businesses[0]
    : membership.businesses;

  const isManager = actorRole === "manager";

  const { data: actorAssignments } = isManager
    ? await supabase
        .from("branch_users")
        .select("branch_id")
        .eq("user_id", user.id)
    : { data: [] as { branch_id: string }[] };

  const managerBranchIds = (actorAssignments ?? []).map(
    (row) => row.branch_id,
  );

  let branchQuery = supabase
    .from("branches")
    .select("id, name, status")
    .eq("business_id", membership.business_id)
    .order("created_at", { ascending: true });

  if (isManager) {
    branchQuery = branchQuery.in(
      "id",
      managerBranchIds.length
        ? managerBranchIds
        : ["00000000-0000-0000-0000-000000000000"],
    );
  }

  let memberQuery = supabase
    .from("business_users")
    .select("id, user_id, role, is_active, created_at")
    .eq("business_id", membership.business_id)
    .order("created_at", { ascending: true });

  if (isManager) memberQuery = memberQuery.eq("role", "staff");

  const [{ data: branches }, { data: rawMembers }] = await Promise.all([
    branchQuery,
    memberQuery,
  ]);

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
      ? supabase
          .from("profiles")
          .select("id, full_name, email, phone")
          .in("id", candidateUserIds)
      : Promise.resolve({ data: [] as Profile[] }),
  ]);

  const assignments = (assignmentsResult.data ?? []) as BranchUser[];

  if (isManager) {
    const visibleStaffIds = new Set(
      assignments.map((assignment) => assignment.user_id),
    );
    members = members.filter((member) =>
      visibleStaffIds.has(member.user_id),
    );
  }

  const visibleMemberIds = new Set(members.map((member) => member.user_id));
  const rawProfiles = (profilesResult.data ?? []).filter((profile) =>
    visibleMemberIds.has(profile.id),
  );

  const profiles = (rawProfiles ?? []) as Profile[];
  const profileById = new Map(
    profiles.map((profile) => [profile.id, profile]),
  );

  const branchById = new Map(
    visibleBranches.map((branch) => [branch.id, branch]),
  );

  const branchesByUser = new Map<string, string[]>();
  for (const assignment of assignments) {
    const list = branchesByUser.get(assignment.user_id) ?? [];
    list.push(assignment.branch_id);
    branchesByUser.set(assignment.user_id, list);
  }

  const selectedBranchId =
    params.branch &&
    visibleBranches.some((branch) => branch.id === params.branch)
      ? params.branch
      : "all";

  const memberCountByBranch = new Map<string, number>();
  for (const branch of visibleBranches) {
    const count = members.filter((member) =>
      (branchesByUser.get(member.user_id) ?? []).includes(branch.id),
    ).length;
    memberCountByBranch.set(branch.id, count);
  }

  const displayedMembers =
    selectedBranchId === "all"
      ? members
      : members.filter((member) =>
          (branchesByUser.get(member.user_id) ?? []).includes(
            selectedBranchId,
          ),
        );

  const canManageMember = (memberRole: Role) => {
    if (isManager) return memberRole === "staff";
    return memberRole === "manager" || memberRole === "staff";
  };

  const activeBranches = visibleBranches.filter(
    (branch) => branch.status === "active",
  );

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

        <section className="dashboard-section team-branch-tabs-card">
          <ResponsiveBranchSelect
            branches={visibleBranches.map((branch) => ({
              id: branch.id,
              name: branch.name,
              meta: `${memberCountByBranch.get(branch.id) ?? 0} people`,
            }))}
            selectedBranchId={selectedBranchId}
            includeAll
            allLabel="View all team"
          />
          <div className="service-branch-tabs service-branch-tabs-desktop">
            <Link
              href="/dashboard/team?branch=all"
              scroll={false}
              className={
                selectedBranchId === "all"
                  ? "service-branch-tab service-branch-tab-active"
                  : "service-branch-tab"
              }
            >
              <strong>View all team</strong>
              <span>{members.length} total</span>
            </Link>

            {visibleBranches.map((branch) => (
              <Link
                key={branch.id}
                href={`/dashboard/team?branch=${branch.id}`}
                scroll={false}
                className={
                  selectedBranchId === branch.id
                    ? "service-branch-tab service-branch-tab-active"
                    : "service-branch-tab"
                }
              >
                <strong>{branch.name}</strong>
                <span>
                  {memberCountByBranch.get(branch.id) ?? 0} people
                </span>
              </Link>
            ))}
          </div>
        </section>

        <div className="team-layout">
          <section className="dashboard-section dashboard-section-stack management-list-card">
            <div className="section-row">
              <div>
                <p className="eyebrow">
                  {isManager ? "Staff in your branches" : "Business users"}
                </p>
                <h2>
                  {displayedMembers.length} team member
                  {displayedMembers.length === 1 ? "" : "s"}
                </h2>
              </div>
            </div>

            <div className="team-list">
              {displayedMembers.map((member) => {
                const profile = profileById.get(member.user_id);
                const assignedIds = branchesByUser.get(member.user_id) ?? [];
                const assignedNames = assignedIds
                  .map((id) => branchById.get(id)?.name)
                  .filter(Boolean);

                const editable = canManageMember(member.role);
                const protectedRole =
                  member.role === "owner" || member.role === "admin";

                return (
                  <article className="team-card" key={member.id}>
                    <div className="team-card-header">
                      <div className="team-identity">
                        <div
                          className={`team-avatar team-avatar-${member.role}`}
                          aria-hidden="true"
                        >
                          {(profile?.full_name ?? "T").slice(0, 1).toUpperCase()}
                        </div>
                        <div className="team-identity-copy">
                          <strong>{profile?.full_name ?? "Team member"}</strong>
                          <span>
                            {profile?.email ?? "No email"}
                            {profile?.phone ? ` · ${profile.phone}` : ""}
                          </span>
                        </div>
                      </div>

                      <div className="team-chip-row">
                        <span className="status-chip">{member.role}</span>
                        <span
                          className={
                            member.is_active
                              ? "status-chip"
                              : "status-chip status-chip-off"
                          }
                        >
                          {member.is_active ? "active" : "inactive"}
                        </span>
                      </div>
                    </div>

                    {protectedRole || !editable ? (
                      <div className="team-owner-note">
                        {member.role === "owner"
                          ? "Business owner · protected"
                          : member.role === "admin"
                            ? "Business admin · protected"
                            : "You cannot manage this account"}
                      </div>
                    ) : (
                      <div className="team-card-summary">
                        <div>
                          <span className="field-label">Assigned branches</span>
                          <span className="team-assigned-summary">
                            {assignedNames.length
                              ? assignedNames.join(", ")
                              : "No branch assigned"}
                          </span>
                        </div>
                        <TeamMemberEditModal
                          userId={member.user_id}
                          memberName={profile?.full_name ?? "Team member"}
                          email={visibleEmail(profile?.email ?? null) ?? ""}
                          phone={profile?.phone ?? ""}
                          role={member.role as "manager" | "staff"}
                          isActive={member.is_active}
                          assignedBranchIds={assignedIds}
                          branches={activeBranches.map((branch) => ({
                            id: branch.id,
                            name: branch.name,
                          }))}
                          managerMode={isManager}
                          viewBranch={selectedBranchId}
                        />
                      </div>
                    )}
                  </article>
                );
              })}
              {!displayedMembers.length ? (
                <div className="mini-empty">
                  <strong>No team members in this branch.</strong>
                  <span>
                    Create or assign a manager/staff member to this branch.
                  </span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="dashboard-section dashboard-section-stack management-form-card">
            <div>
              <p className="eyebrow">Add team member</p>
              <h2>
                {isManager ? "Create staff account" : "Create team account"}
              </h2>
              <p className="muted">
                {isManager
                  ? "Create staff for one of your assigned branches."
                  : "Create a manager or staff account. Staff must belong to one branch only."}
              </p>
            </div>

            <form
              action={createTeamMember}
              className="form-stack management-form"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore="true"
            >
              <input
                type="hidden"
                name="view_branch"
                value={selectedBranchId}
              />

              <TeamCreateFields
                branches={activeBranches}
                managerMode={isManager}
              />

              <button
                className="button button-primary"
                type="submit"
              >
                Create team member
              </button>
            </form>
          </section>
        </div>
      </section>
    </>
  );
}