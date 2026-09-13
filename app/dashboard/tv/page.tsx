import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
    .select("business_id,role")
    .eq("user_id", user.id).eq("is_active", true).limit(1).maybeSingle();
  if (!membership) redirect("/onboarding");

  const role = membership.role as Role;
  const businessWide = role === "owner" || role === "admin";
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
  const { data: tickets } = await supabase.from("tickets")
    .select("id,branch_id,display_number,status,joined_at,called_at,serving_at,queue_sessions!inner(session_date,status)")
    .eq("branch_id", selectedBranch.id)
    .eq("queue_sessions.session_date", today)
    .eq("queue_sessions.status", "open")
    .in("status", ["waiting", "called", "serving"])
    .order("joined_at", { ascending: true })
    .limit(250);

  return (
    <div className="dashboard-content tv-dashboard-content">
      <TvQueueDisplay
        key={`${selectedBranch.id}:${(tickets ?? []).map((ticket) => `${ticket.id}:${ticket.status}:${ticket.called_at ?? ""}:${ticket.serving_at ?? ""}`).join("|")}`}
        branches={branches.map((branch) => ({ id: branch.id, name: branch.name }))}
        selectedBranchId={selectedBranch.id}
        initialTickets={(tickets ?? []).map((ticket) => ({
          id: ticket.id,
          branch_id: ticket.branch_id,
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
