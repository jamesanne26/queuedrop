import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardResultModal } from "@/app/dashboard/_components/dashboard-result-modal";
import { PreserveDashboardScroll } from "@/app/dashboard/_components/preserve-dashboard-scroll";
import { createClient } from "@/lib/supabase/server";
import { createService, setServiceActive } from "./actions";

type Props = {
  searchParams: Promise<{
    message?: string;
    error?: string;
    branch?: string;
  }>;
};

type Role = "owner" | "admin" | "manager" | "staff";

export default async function ServicesPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/auth/login?next=%2Fdashboard%2Fservices");

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
    status: string;
    address: string | null;
  }[] = [];

  if (canManage || (allowedBranchIds?.length ?? 0) > 0) {
    let query = supabase
      .from("branches")
      .select("id, name, status, address")
      .eq("business_id", membership.business_id)
      .order("created_at", { ascending: true });

    if (!canManage && allowedBranchIds) {
      query = query.in("id", allowedBranchIds);
    }

    const { data } = await query;
    branches = data ?? [];
  }

  const branchIds = branches.map((branch) => branch.id);

  const { data: allServices } = branchIds.length
    ? await supabase
        .from("services")
        .select(
          "id, branch_id, name, description, queue_prefix, estimated_minutes, is_active, created_at",
        )
        .in("branch_id", branchIds)
        .order("created_at", { ascending: true })
    : { data: [] };

  const selectedBranchId =
    params.branch && branches.some((branch) => branch.id === params.branch)
      ? params.branch
      : "all";

  const visibleServices =
    selectedBranchId === "all"
      ? allServices ?? []
      : (allServices ?? []).filter(
          (service) => service.branch_id === selectedBranchId,
        );

  const branchById = new Map(
    branches.map((branch) => [branch.id, branch]),
  );

  const countByBranch = new Map<string, number>();
  for (const service of allServices ?? []) {
    countByBranch.set(
      service.branch_id,
      (countByBranch.get(service.branch_id) ?? 0) + 1,
    );
  }

  return (
    <>
      <PreserveDashboardScroll />
      <DashboardResultModal success={params.message} error={params.error} />
      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">
              {canManage ? "Service management" : "Assigned branch services"}
            </p>
            <h1>{business?.name ?? "QueueDrop"}</h1>
            <p className="muted page-lead">
              {canManage
                ? "Services are grouped by branch. Use the tabs to focus on one location or view the complete service catalog."
                : "View the services available in your assigned branch locations."}
            </p>
          </div>
          <span className="env-badge">DEV</span>
        </header>

        <section className="dashboard-section service-tabs-card">
          <div className="service-branch-tabs">
            <Link
              href="/dashboard/services?branch=all"
              scroll={false}
              className={
                selectedBranchId === "all"
                  ? "service-branch-tab service-branch-tab-active"
                  : "service-branch-tab"
              }
            >
              <strong>View all services</strong>
              <span>{allServices?.length ?? 0} total</span>
            </Link>

            {branches.map((branch) => (
              <Link
                key={branch.id}
                href={`/dashboard/services?branch=${branch.id}`}
                scroll={false}
                className={
                  selectedBranchId === branch.id
                    ? "service-branch-tab service-branch-tab-active"
                    : "service-branch-tab"
                }
              >
                <strong>{branch.name}</strong>
                <span>{countByBranch.get(branch.id) ?? 0} services</span>
              </Link>
            ))}
          </div>
        </section>

        <div className="management-grid services-management-grid">
          <section className="dashboard-section dashboard-section-stack management-list-card">
            <div className="section-row">
              <div>
                <p className="eyebrow">Configured services</p>
                <h2>
                  {visibleServices.length} service
                  {visibleServices.length === 1 ? "" : "s"}
                </h2>
              </div>
            </div>

            {visibleServices.length ? (
              <div className="service-list">
                {visibleServices.map((service) => {
                  const branch = branchById.get(service.branch_id);

                  return (
                    <article className="service-row" key={service.id}>
                      <div className="service-main">
                        <div className="service-title-row">
                          <strong>{service.name}</strong>
                          <span
                            className={
                              service.is_active
                                ? "status-chip"
                                : "status-chip status-chip-off"
                            }
                          >
                            {service.is_active ? "active" : "inactive"}
                          </span>
                        </div>

                        <span>
                          {branch?.name ?? "Unknown branch"} · Prefix{" "}
                          {service.queue_prefix || "branch default"} ·{" "}
                          {service.estimated_minutes
                            ? `${service.estimated_minutes} min`
                            : "No ETA set"}
                        </span>

                        {service.description ? (
                          <p>{service.description}</p>
                        ) : null}
                      </div>

                      {canManage ? (
                        <form action={setServiceActive}>
                          <input
                            type="hidden"
                            name="service_id"
                            value={service.id}
                          />
                          <input
                            type="hidden"
                            name="branch_id"
                            value={selectedBranchId}
                          />
                          <input
                            type="hidden"
                            name="next_active"
                            value={service.is_active ? "false" : "true"}
                          />
                          <button
                            className="button button-secondary button-small"
                            type="submit"
                          >
                            {service.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </form>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mini-empty">
                <strong>No services in this view.</strong>
                <span>
                  Select another branch tab or create a service for this branch.
                </span>
              </div>
            )}
          </section>

          {canManage ? (
            <section className="dashboard-section dashboard-section-stack management-form-card service-create-card">
              <div>
                <p className="eyebrow">Add queue category</p>
                <h2>Create service</h2>
              </div>

              <form
                action={createService}
                className="form-stack management-form"
              >
                {selectedBranchId !== "all" ? (
                  <input
                    type="hidden"
                    name="branch_id"
                    value={selectedBranchId}
                  />
                ) : (
                  <div className="mini-empty">
                    <strong>Select a branch first.</strong>
                    <span>
                      Choose a branch tab above before creating a service.
                    </span>
                  </div>
                )}

                <label>
                  Service name
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={120}
                    placeholder="e.g. Haircut"
                  />
                </label>

                <label>
                  Description <em>optional</em>
                  <textarea
                    name="description"
                    maxLength={500}
                    placeholder="What this queue is for"
                  />
                </label>

                <div className="form-split">
                  <label>
                    Queue prefix <em>optional</em>
                    <input
                      name="queue_prefix"
                      maxLength={6}
                      placeholder="HC"
                    />
                  </label>

                  <label>
                    Estimated minutes <em>optional</em>
                    <input
                      name="estimated_minutes"
                      type="number"
                      min={1}
                      max={480}
                      step={1}
                      placeholder="30"
                    />
                  </label>
                </div>

                <button
                  className="button button-primary"
                  type="submit"
                  disabled={
                    !branches.length || selectedBranchId === "all"
                  }
                >
                  Create service
                </button>
              </form>
            </section>
          ) : null}
        </div>
      </section>
    </>
  );
}
