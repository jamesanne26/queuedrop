import { fetchAllPages } from "@/lib/queue/reliability";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { displayedTvServices } from "@/lib/tv/config";
import { TvQueueDisplay } from "./tv-queue-display";

type Props = { searchParams: Promise<{ branch?: string }> };
type Role = "owner" | "admin" | "manager" | "staff";

function branchDate(timeZone: string | null | undefined) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default async function TvQueuePage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/auth/login?next=%2Fdashboard%2Ftv");

  const { data: membership } = await supabase.from("business_users")
    .select("business_id,role,role_id,can_view_live_queue,roles(branch_scope)")
    .eq("user_id", user.id).eq("is_active", true).limit(1).maybeSingle();
  if (!membership) redirect("/onboarding");
  if (membership.role !== "owner" && membership.role !== "admin" && !membership.can_view_live_queue) redirect("/dashboard");

  const role = membership.role as Role;
  const roleRelation = Array.isArray(membership.roles) ? membership.roles[0] : membership.roles;
  const businessWide = role === "owner" || role === "admin" || (role === "manager" && roleRelation?.branch_scope === "all_branches");
  let branchIds: string[] | null = null;
  if (!businessWide) {
    const { data: assignments } = await supabase.from("branch_users").select("branch_id").eq("user_id", user.id);
    branchIds = (assignments ?? []).map((row) => row.branch_id);
  }

  let branchQuery = supabase.from("branches").select("id,name,timezone")
    .eq("business_id", membership.business_id).eq("status", "active").order("created_at");
  if (branchIds) branchQuery = branchQuery.in("id", branchIds.length ? branchIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: branchRows } = await branchQuery;
  const branches = branchRows ?? [];
  const selectedBranch = branches.find((branch) => branch.id === params.branch) ?? branches[0];
  if (!selectedBranch) redirect("/dashboard");

  const today = branchDate(selectedBranch.timezone);
  const [serviceResult, settingsResult, sessionResult] = await Promise.all([
    supabase.from("services").select("id,name,is_active").eq("branch_id", selectedBranch.id).order("created_at"),
    supabase.from("branch_tv_settings").select("service_count,service_ids").eq("branch_id", selectedBranch.id).maybeSingle(),
    supabase.from("queue_sessions").select("id").eq("branch_id", selectedBranch.id).eq("session_date", today).eq("status", "open"),
  ]);
  const services = displayedTvServices(serviceResult.data ?? [], settingsResult.data);
  const sessionIds = (sessionResult.data ?? []).map(session => session.id);
  const ticketResults = await Promise.all(services.map(service => sessionIds.length ? fetchAllPages((from, to) => supabase.from("tickets")
    .select("id,branch_id,service_id,queue_session_id,display_number,status,joined_at,called_at,serving_at")
    .eq("branch_id", selectedBranch.id).eq("service_id", service.id).in("queue_session_id", sessionIds)
    .in("status", ["waiting", "called", "serving"]).order("joined_at", { ascending: true }).order("id").range(from, to))
      .then(data => ({data, error: null}))
      .catch(() => ({data: [], error: { message: "Unable to load service queue" }}))
    : Promise.resolve({ data: [], error: null })));
  const tickets = ticketResults.flatMap(result => result.data ?? []);
  const loadError = Boolean(serviceResult.error || settingsResult.error || sessionResult.error || ticketResults.some(result => result.error));

  return (
    <div className="dashboard-content tv-dashboard-content">
      <TvQueueDisplay
        branches={branches.map((branch) => ({ id: branch.id, name: branch.name }))}
        selectedBranchId={selectedBranch.id}
        services={services}
        sessionIds={sessionIds}
        loadError={loadError}
        initialTickets={(tickets ?? []).map((ticket) => ({
          id: ticket.id,
          branch_id: ticket.branch_id,
          service_id: ticket.service_id,
          queue_session_id: ticket.queue_session_id,
          display_number: ticket.display_number,
          status: ticket.status as "waiting" | "called" | "serving",
          joined_at: ticket.joined_at,
          called_at: ticket.called_at,
          serving_at: ticket.serving_at,
        }))}
      />
    </div>
  );
}
