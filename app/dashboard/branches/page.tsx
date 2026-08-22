import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createBranch,
  deleteBranch,
  updateBranch,
} from "./actions";
import { DeleteBranchButton } from "./delete-branch-button";
import { DashboardSidebar } from "@/app/dashboard/_components/sidebar";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{ message?: string; error?: string }>;
};

type Role = "owner" | "admin" | "manager" | "staff";

export default async function BranchesPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/auth/login?next=%2Fdashboard%2Fbranches");

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, role, businesses(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  const role = membership.role as Role;
  const canManage = role === "owner" || role === "admin";
  const business = Array.isArray(membership.businesses)
    ? membership.businesses[0]
    : membership.businesses;

  let allowedBranchIds: string[] | null = null;

  if (!canManage) {
    const { data: assignments } = await supabase
      .from("branch_users")
      .select("branch_id")
      .eq("user_id", user.id);

    allowedBranchIds = (assignments ?? []).map(
      (assignment) => assignment.branch_id,
    );
  }

  let branches: {
    id: string;
    name: string;
    slug: string;
    status: string;
    address: string | null;
    phone: string | null;
    created_at: string;
  }[] = [];

  if (canManage || (allowedBranchIds?.length ?? 0) > 0) {
    let query = supabase
      .from("branches")
      .select("id, name, slug, status, address, phone, created_at")
      .eq("business_id", membership.business_id)
      .order("created_at", { ascending: true });

    if (!canManage && allowedBranchIds) {
      query = query.in("id", allowedBranchIds);
    }

    const { data } = await query;
    branches = data ?? [];
  }

  const branchIds = branches.map((branch) => branch.id);

  const { data: configs } = branchIds.length
    ? await supabase
        .from("queue_configurations")
        .select(
          "branch_id, ticket_prefix, starting_number, no_show_minutes, allow_qr_join, is_active",
        )
        .in("branch_id", branchIds)
    : { data: [] };

  const configByBranch = new Map(
    (configs ?? []).map((config) => [config.branch_id, config]),
  );

  return (
    <main className="dashboard-shell">
      <DashboardSidebar active="branches" />

      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">
              {canManage ? "Branch management" : "Assigned branch"}
            </p>
            <h1>{business?.name ?? "QueueDrop"}</h1>
            <p className="muted page-lead">
              {canManage
                ? "Create, edit, activate/deactivate, and safely delete empty branch locations."
                : "You can only view branch locations assigned to your account."}
            </p>
          </div>

          <span className="env-badge">DEV</span>
        </header>

        {params.message ? (
          <div className="notice notice-success">{params.message}</div>
        ) : null}

        {params.error ? (
          <div className="notice notice-error">{params.error}</div>
        ) : null}

        <div className="management-grid">
          <section className="dashboard-section dashboard-section-stack management-list-card">
            <div className="section-row">
              <div>
                <p className="eyebrow">Locations</p>
                <h2>
                  {branches.length} branch
                  {branches.length === 1 ? "" : "es"}
                </h2>
              </div>

              <Link className="text-link" href="/dashboard/services">
                View services →
              </Link>
            </div>

            <div className="branch-list">
              {branches.map((branch) => {
                const config = configByBranch.get(branch.id);

                if (!canManage) {
                  return (
                    <article
                      className="branch-row branch-row-rich"
                      key={branch.id}
                    >
                      <div>
                        <strong>{branch.name}</strong>
                        <span>{branch.address || "No address added"}</span>
                        <span className="detail-line">
                          Queue: {config?.ticket_prefix ?? "Q"} · starts at{" "}
                          {config?.starting_number ?? 1} · no-show{" "}
                          {config?.no_show_minutes ?? 5} min
                        </span>
                      </div>

                      <div className="branch-meta">
                        <span>{branch.phone || "No contact number"}</span>
                        <span className="status-chip">{branch.status}</span>
                      </div>
                    </article>
                  );
                }

                return (
                  <article className="team-card" key={branch.id}>
                    <form action={updateBranch} className="team-edit-form">
                      <input
                        type="hidden"
                        name="branch_id"
                        value={branch.id}
                      />

                      <div className="team-card-header">
                        <div>
                          <strong>{branch.name}</strong>
                          <span>
                            Public slug: {branch.slug} · Queue{" "}
                            {config?.ticket_prefix ?? "Q"}
                          </span>
                        </div>

                        <button
                          className="button button-primary button-small"
                          type="submit"
                        >
                          Save changes
                        </button>
                      </div>

                      <label>
                        Branch name
                        <input
                          name="name"
                          required
                          minLength={2}
                          maxLength={120}
                          defaultValue={branch.name}
                        />
                        <small>
                          Renaming does not change the existing public queue URL.
                        </small>
                      </label>

                      <label>
                        Address <em>optional</em>
                        <input
                          name="address"
                          maxLength={300}
                          defaultValue={branch.address ?? ""}
                          placeholder="Branch address"
                        />
                      </label>

                      <label>
                        Contact number <em>optional</em>
                        <input
                          name="phone"
                          maxLength={32}
                          defaultValue={branch.phone ?? ""}
                          placeholder="+63 917 123 4567"
                        />
                      </label>

                      <label>
                        Status
                        <select name="status" defaultValue={branch.status}>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                        <small>
                          Use Inactive instead of deleting a branch that already
                          has queue history.
                        </small>
                      </label>

                      <div className="team-form-footer">
                        <span>
                          Queue starts at {config?.starting_number ?? 1} ·
                          no-show {config?.no_show_minutes ?? 5} min
                        </span>
                      </div>
                    </form>

                    <form action={deleteBranch}>
                      <input
                        type="hidden"
                        name="branch_id"
                        value={branch.id}
                      />
                      <DeleteBranchButton branchName={branch.name} />
                    </form>
                  </article>
                );
              })}

              {!branches.length ? (
                <div className="mini-empty">
                  <strong>No branch assignment.</strong>
                  <span>
                    Ask a business owner/admin to assign this account to a
                    branch.
                  </span>
                </div>
              ) : null}
            </div>
          </section>

          {canManage ? (
            <section className="dashboard-section dashboard-section-stack management-form-card">
              <div>
                <p className="eyebrow">Add location</p>
                <h2>Create branch</h2>
                <p className="muted">
                  QueueDrop automatically creates its default queue
                  configuration and gives you branch access.
                </p>
              </div>

              <form
                action={createBranch}
                className="form-stack management-form"
              >
                <label>
                  Branch name
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={120}
                    placeholder="e.g. Cubao Branch"
                  />
                </label>

                <label>
                  Address <em>optional</em>
                  <input
                    name="address"
                    maxLength={300}
                    placeholder="Branch address"
                  />
                </label>

                <label>
                  Contact number <em>optional</em>
                  <input
                    name="phone"
                    maxLength={32}
                    placeholder="+63 917 123 4567"
                  />
                </label>

                <button
                  className="button button-primary"
                  type="submit"
                >
                  Create branch
                </button>
              </form>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
