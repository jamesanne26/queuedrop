import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/app/dashboard/_components/sidebar";
import { createClient } from "@/lib/supabase/server";
import { createTeamMember, updateTeamMember } from "./actions";

type Props = { searchParams: Promise<{ message?: string; error?: string }> };

type Member = {
  id: string;
  user_id: string;
  role: "owner" | "admin" | "manager" | "staff";
  is_active: boolean;
  created_at: string;
};

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
    .select("business_id, role, is_active, businesses(name)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");
  if (membership.role !== "owner" && membership.role !== "admin") redirect("/dashboard");

  const business = Array.isArray(membership.businesses) ? membership.businesses[0] : membership.businesses;

  const [{ data: rawMembers }, { data: branches }] = await Promise.all([
    supabase
      .from("business_users")
      .select("id, user_id, role, is_active, created_at")
      .eq("business_id", membership.business_id)
      .order("created_at", { ascending: true }),
    supabase
      .from("branches")
      .select("id, name, status")
      .eq("business_id", membership.business_id)
      .order("created_at", { ascending: true }),
  ]);

  const members = (rawMembers ?? []) as Member[];
  const userIds = members.map((member) => member.user_id);
  const branchIds = (branches ?? []).map((branch) => branch.id);

  const [{ data: rawProfiles }, { data: rawAssignments }] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id, full_name, email, phone").in("id", userIds)
      : Promise.resolve({ data: [] as Profile[] }),
    branchIds.length && userIds.length
      ? supabase.from("branch_users").select("user_id, branch_id").in("branch_id", branchIds).in("user_id", userIds)
      : Promise.resolve({ data: [] as BranchUser[] }),
  ]);

  const profiles = (rawProfiles ?? []) as Profile[];
  const assignments = (rawAssignments ?? []) as BranchUser[];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const branchById = new Map((branches ?? []).map((branch) => [branch.id, branch as Branch]));
  const branchesByUser = new Map<string, string[]>();

  for (const assignment of assignments) {
    const list = branchesByUser.get(assignment.user_id) ?? [];
    list.push(assignment.branch_id);
    branchesByUser.set(assignment.user_id, list);
  }

  return (
    <main className="dashboard-shell">
      <DashboardSidebar active="team" />
      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Team & access</p>
            <h1>{business?.name ?? "QueueDrop"}</h1>
            <p className="muted page-lead">Owners and admins can create team accounts, assign roles, and control exactly which branches managers and staff can operate.</p>
          </div>
          <span className="env-badge">DEV</span>
        </header>

        {params.message ? <div className="notice notice-success">{params.message}</div> : null}
        {params.error ? <div className="notice notice-error">{params.error}</div> : null}

        <div className="team-layout">
          <section className="dashboard-section dashboard-section-stack management-list-card">
            <div className="section-row">
              <div>
                <p className="eyebrow">Business users</p>
                <h2>{members.length} team member{members.length === 1 ? "" : "s"}</h2>
              </div>
            </div>

            <div className="team-list">
              {members.map((member) => {
                const profile = profileById.get(member.user_id);
                const assignedIds = branchesByUser.get(member.user_id) ?? [];
                const assignedNames = assignedIds.map((id) => branchById.get(id)?.name).filter(Boolean);
                const isOwner = member.role === "owner";

                return (
                  <article className="team-card" key={member.id}>
                    <div className="team-card-header">
                      <div>
                        <strong>{profile?.full_name ?? "Team member"}</strong>
                        <span>{profile?.email ?? "No email"}{profile?.phone ? ` · ${profile.phone}` : ""}</span>
                      </div>
                      <div className="team-chip-row">
                        <span className="status-chip">{member.role}</span>
                        <span className={member.is_active ? "status-chip" : "status-chip status-chip-off"}>{member.is_active ? "active" : "inactive"}</span>
                      </div>
                    </div>

                    {isOwner ? (
                      <div className="team-owner-note">Business owner · all branches</div>
                    ) : (
                      <form action={updateTeamMember} className="team-edit-form">
                        <input type="hidden" name="user_id" value={member.user_id} />
                        <div className="form-split">
                          <label>Role
                            <select name="role" defaultValue={member.role}>
                              <option value="admin">Admin</option>
                              <option value="manager">Manager</option>
                              <option value="staff">Staff</option>
                            </select>
                          </label>
                          <label>Access
                            <select name="is_active" defaultValue={member.is_active ? "true" : "false"}>
                              <option value="true">Active</option>
                              <option value="false">Inactive</option>
                            </select>
                          </label>
                        </div>
                        <fieldset className="branch-checkboxes">
                          <legend>Assigned branches <small>required for manager/staff</small></legend>
                          {(branches ?? []).map((branch) => (
                            <label key={branch.id}>
                              <input type="checkbox" name="branch_ids" value={branch.id} defaultChecked={assignedIds.includes(branch.id)} />
                              <span>{branch.name}</span>
                            </label>
                          ))}
                        </fieldset>
                        <div className="team-form-footer">
                          <span>{assignedNames.length ? assignedNames.join(", ") : member.role === "admin" ? "Business-wide access" : "No branch assigned"}</span>
                          <button className="button button-secondary button-small" type="submit">Save access</button>
                        </div>
                      </form>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="dashboard-section dashboard-section-stack management-form-card">
            <div>
              <p className="eyebrow">Add team member</p>
              <h2>Create staff account</h2>
              <p className="muted">This milestone creates the Auth account immediately. Share the temporary password securely; email invitations will be added when outbound email is wired to TEST/PROD.</p>
            </div>

            <form action={createTeamMember} className="form-stack management-form">
              <label>Full name<input name="full_name" required minLength={2} maxLength={100} placeholder="e.g. Maria Santos" /></label>
              <label>Email<input name="email" type="email" required maxLength={254} placeholder="maria@example.com" /></label>
              <label>Mobile <em>optional</em><input name="phone" maxLength={16} placeholder="+639171234567" /></label>
              <label>Temporary password<input name="temporary_password" type="password" required minLength={10} maxLength={72} placeholder="At least 10 characters" /></label>
              <label>Role
                <select name="role" required defaultValue="staff">
                  <option value="admin">Admin — all business branches</option>
                  <option value="manager">Manager — assigned branches</option>
                  <option value="staff">Staff — assigned branches</option>
                </select>
              </label>
              <fieldset className="branch-checkboxes">
                <legend>Branch assignment <small>select at least one for manager/staff</small></legend>
                {(branches ?? []).filter((branch) => branch.status === "active").map((branch) => (
                  <label key={branch.id}>
                    <input type="checkbox" name="branch_ids" value={branch.id} />
                    <span>{branch.name}</span>
                  </label>
                ))}
              </fieldset>
              <button className="button button-primary" type="submit">Create team member</button>
            </form>
          </section>
        </div>
      </section>
    </main>
  );
}
