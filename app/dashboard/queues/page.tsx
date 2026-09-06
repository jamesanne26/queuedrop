import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LiveQueueRefresh } from "./live-queue-refresh";
import { LiveQueueWorkspace } from "./live-queue-workspace";
import { isSystemOwner } from "@/lib/auth/system-owner";

type Props = { searchParams: Promise<{ branch?: string; service?: string; success?: string; error?: string }> };
type Role = "owner" | "admin" | "manager" | "staff";

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

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

export default async function QueuesPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/auth/login?next=%2Fdashboard%2Fqueues");

  const { data: membership } = await supabase.from("business_users")
    .select("business_id, role, businesses(name)")
    .eq("user_id", user.id).eq("is_active", true).limit(1).maybeSingle();
  if (!membership) redirect("/onboarding");

  const business = relationOne(membership.businesses);
  const role = membership.role as Role;
  const developer = await isSystemOwner(user);
  const businessWide = role === "owner" || role === "admin";

  let allowedBranchIds: string[] | null = null;
  if (!businessWide) {
    const { data } = await supabase.from("branch_users").select("branch_id").eq("user_id", user.id);
    allowedBranchIds = (data ?? []).map((row) => row.branch_id);
  }

  let branchQuery = supabase.from("branches")
    .select("id,name,status,address,timezone")
    .eq("business_id", membership.business_id)
    .order("created_at", { ascending: true });
  if (!businessWide && allowedBranchIds) branchQuery = branchQuery.in("id", allowedBranchIds);
  const { data: branchesData } = await branchQuery;
  const branches = branchesData ?? [];

  const selectedBranchId = params.branch && branches.some((b) => b.id === params.branch) ? params.branch : branches[0]?.id;
  const selectedBranch = branches.find((b) => b.id === selectedBranchId);
  if (!selectedBranchId || !selectedBranch || !business) redirect("/dashboard");

  const currentSessionDate = branchDate(selectedBranch.timezone);

  const [servicesResult, ticketsResult] = await Promise.all([
    supabase.from("services")
      .select("id,name,is_active")
      .eq("branch_id", selectedBranchId)
      .eq("is_active", true)
      .order("created_at"),
    supabase.from("tickets")
      .select("id,display_number,status,joined_at,called_at,serving_at,updated_at,service_id,ticket_number,sms_phone,customer_sessions(session_token),services(id,name),queue_sessions!inner(id,session_date,status)")
      .eq("branch_id", selectedBranchId)
      .eq("queue_sessions.session_date", currentSessionDate)
      .eq("queue_sessions.status", "open")
      .in("status", ["waiting", "called", "serving"])
      .order("joined_at", { ascending: true })
      .limit(250),
  ]);
  const services = servicesResult.data ?? [];

  const tickets = ticketsResult.data ?? [];
  const waitingPositionByTicket = new Map<string, number>();
  for (const service of services) {
    tickets.filter((t) => t.service_id === service.id && t.status === "waiting")
      .sort((a, b) => a.ticket_number - b.ticket_number)
      .forEach((t, index) => waitingPositionByTicket.set(t.id, index + 1));
  }

  const clientTickets = tickets.map((ticket) => ({
    id: ticket.id,
    display_number: ticket.display_number,
    ticket_number: ticket.ticket_number,
    status: ticket.status as "waiting" | "called" | "serving",
    service_id: ticket.service_id,
    service_name: relationOne(ticket.services)?.name ?? "Service",
    position: waitingPositionByTicket.get(ticket.id) ?? null,
    sms_enabled: Boolean(ticket.sms_phone),
    sms_phone: ticket.sms_phone,
    session_token: relationOne(ticket.customer_sessions)?.session_token ?? null,
    joined_at: ticket.joined_at,
    called_at: ticket.called_at,
    serving_at: ticket.serving_at,
    updated_at: ticket.updated_at,
  }));

  return <>
    <LiveQueueRefresh branchId={selectedBranchId} />
    <LiveQueueWorkspace
      key={selectedBranchId}
      role={role}
      canSimulateStub={developer || role === "owner" || role === "admin"}
      businessName={business.name}
      selectedBranchId={selectedBranchId}
      selectedBranch={{ id: selectedBranch.id, name: selectedBranch.name, address: selectedBranch.address }}
      branches={branches.map((b) => ({ id: b.id, name: b.name, address: b.address }))}
      services={services.map((s) => ({ id: s.id, name: s.name }))}
      initialServiceId={params.service ?? null}
      tickets={clientTickets}
      currentSessionDate={currentSessionDate}
      successMessage={params.success}
      errorMessage={params.error}
    />
  </>;
}
