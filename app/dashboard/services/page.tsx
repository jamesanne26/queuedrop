import { redirect } from "next/navigation";
import { DashboardResultModal } from "@/app/dashboard/_components/dashboard-result-modal";
import { PreserveDashboardScroll } from "@/app/dashboard/_components/preserve-dashboard-scroll";
import { createClient } from "@/lib/supabase/server";
import { ServicesWorkspace } from "./services-workspace";

type Props = { searchParams: Promise<{ message?: string; error?: string; branch?: string }> };
type Role = "owner" | "admin" | "manager" | "staff";

export default async function ServicesPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/auth/login?next=%2Fdashboard%2Fservices");

  const { data: membership } = await supabase.from("business_users").select("business_id, role, can_manage_services, businesses(name)").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership) redirect("/onboarding");
  const role = membership.role as Role;
  const canManage = role === "owner" || role === "admin" || Boolean(membership.can_manage_services);
  const business = Array.isArray(membership.businesses) ? membership.businesses[0] : membership.businesses;

  let allowedBranchIds: string[] | null = null;
  if (!canManage) {
    const { data: assignments } = await supabase.from("branch_users").select("branch_id").eq("user_id", user.id);
    allowedBranchIds = (assignments ?? []).map((assignment) => assignment.branch_id);
  }

  let branches: { id: string; name: string; status: string; address: string | null }[] = [];
  if (canManage || (allowedBranchIds?.length ?? 0) > 0) {
    let query = supabase.from("branches").select("id, name, status, address").eq("business_id", membership.business_id).order("created_at", { ascending: true });
    if (!canManage && allowedBranchIds) query = query.in("id", allowedBranchIds);
    const { data } = await query;
    branches = data ?? [];
  }

  const branchIds = branches.map((branch) => branch.id);
  const { data: allServices } = branchIds.length
    ? await supabase.from("services").select("id, branch_id, name, description, queue_prefix, estimated_minutes, is_active, created_at").in("branch_id", branchIds).order("created_at", { ascending: true })
    : { data: [] };

  const selectedBranchId = params.branch && branches.some((branch) => branch.id === params.branch)
    ? params.branch
    : branches.length === 1
      ? branches[0].id
      : "";

  return <>
    <PreserveDashboardScroll />
    <DashboardResultModal success={params.message} error={params.error} />
    <section className="dashboard-content">
      <header className="dashboard-header"><div><p className="eyebrow">{canManage ? "Service management" : "Assigned branch services"}</p><h1>{business?.name ?? "QueueDrop"}</h1><p className="muted page-lead">{canManage ? "Services are loaded once so switching branches is instant." : "View the services available in your assigned branch locations."}</p></div><span className="env-badge">TEST</span></header>
      <ServicesWorkspace branches={branches} services={(allServices ?? []).map((service) => ({ id: service.id, branch_id: service.branch_id, name: service.name, description: service.description, queue_prefix: service.queue_prefix, estimated_minutes: service.estimated_minutes, is_active: service.is_active }))} canManage={canManage} initialBranchId={selectedBranchId}/>
    </section>
  </>;
}
