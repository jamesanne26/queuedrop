import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getQueueQrDataUrl } from "@/lib/queue/qr-cache";
import { createClient } from "@/lib/supabase/server";
import { LiveQueueRefresh } from "./live-queue-refresh";
import { LiveQueueWorkspace } from "./live-queue-workspace";

type Props = {
  searchParams: Promise<{
    branch?: string;
    service?: string;
    success?: string;
    error?: string;
  }>;
};

type Role = "owner" | "admin" | "manager" | "staff";

type QueueTicket = {
  id: string;
  display_number: string;
  status: "waiting" | "called" | "serving";
  joined_at: string;
  service_id: string;
  ticket_number: number;
  customer_name_override: string | null;
  customer_phone_override: string | null;
  customers:
    | { name: string | null; phone: string | null }
    | { name: string | null; phone: string | null }[]
    | null;
  services:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;
};





function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function QueuesPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/auth/login?next=%2Fdashboard%2Fqueues");

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, role, businesses(name, slug)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  const business = relationOne(membership.businesses);
  const role = membership.role as Role;
  const businessWide = role === "owner" || role === "admin";

  let allowedBranchIds: string[] | null = null;

  if (!businessWide) {
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
  }[] = [];

  if (businessWide || (allowedBranchIds?.length ?? 0) > 0) {
    let query = supabase
      .from("branches")
      .select("id, name, slug, status, address")
      .eq("business_id", membership.business_id)
      .order("created_at", { ascending: true });

    if (!businessWide && allowedBranchIds) {
      query = query.in("id", allowedBranchIds);
    }

    const { data } = await query;
    branches = data ?? [];
  }

  const selectedBranchId =
    params.branch &&
    branches.some((branch) => branch.id === params.branch)
      ? params.branch
      : branches[0]?.id;

  const selectedBranch = branches.find(
    (branch) => branch.id === selectedBranchId,
  );

  if (!selectedBranchId || !selectedBranch || !business) {
    redirect("/dashboard");
  }

  const [servicesResult, ticketsResult, queueConfigResult] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, queue_prefix, is_active")
      .eq("branch_id", selectedBranchId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("tickets")
      .select(
        "id, display_number, status, joined_at, service_id, ticket_number, customer_name_override, customer_phone_override, customers(name, phone), services(id, name)",
      )
      .eq("branch_id", selectedBranchId)
      .in("status", ["waiting", "called", "serving"])
      .order("joined_at", { ascending: true })
      .limit(250),
    supabase
      .from("queue_configurations")
      .select(
        "staff_can_edit_name, staff_can_edit_mobile, manager_can_edit_name, manager_can_edit_mobile",
      )
      .eq("branch_id", selectedBranchId)
      .maybeSingle(),
  ]);

  const services = servicesResult.data ?? [];
  const tickets = (ticketsResult.data ?? []) as QueueTicket[];
  const queueConfig = queueConfigResult.data;

  const canEditName =
    businessWide ||
    (role === "manager"
      ? queueConfig?.manager_can_edit_name
      : queueConfig?.staff_can_edit_name);

  const canEditMobile =
    businessWide ||
    (role === "manager"
      ? queueConfig?.manager_can_edit_mobile
      : queueConfig?.staff_can_edit_mobile);

  const waitingPositionByTicket = new Map<string, number>();

  for (const service of services ?? []) {
    const waiting = tickets
      .filter(
        (ticket) =>
          ticket.service_id === service.id && ticket.status === "waiting",
      )
      .sort((a, b) => a.ticket_number - b.ticket_number);

    waiting.forEach((ticket, index) => {
      waitingPositionByTicket.set(ticket.id, index + 1);
    });
  }

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  const servicesWithQr = await Promise.all(
    (services ?? []).map(async (service) => {
      const joinUrl = `${origin}/q/${business.slug}/${selectedBranch.slug}?service=${encodeURIComponent(
        service.id,
      )}`;

      return {
        id: service.id,
        name: service.name,
        qrDataUrl: await getQueueQrDataUrl(joinUrl),
      };
    }),
  );

  const orderedTickets = [...tickets].sort((a, b) => {
    const priority = (status: QueueTicket["status"]) => {
      if (status === "serving") return 0;
      if (status === "called") return 1;
      return 2;
    };

    const aPriority = priority(a.status);
    const bPriority = priority(b.status);

    if (aPriority !== bPriority) return aPriority - bPriority;

    return (
      new Date(a.joined_at).getTime() -
      new Date(b.joined_at).getTime()
    );
  });

  const clientTickets = orderedTickets.map((ticket) => {
    const customer = relationOne(ticket.customers);
    const service = relationOne(ticket.services);

    return {
      id: ticket.id,
      display_number: ticket.display_number,
      status: ticket.status,
      service_id: ticket.service_id,
      service_name: service?.name ?? "Service",
      position: waitingPositionByTicket.get(ticket.id) ?? null,
      customer_name:
        ticket.customer_name_override ?? customer?.name ?? "Customer",
      customer_phone:
        ticket.customer_phone_override ?? customer?.phone ?? "—",
    };
  });

  return (
    <>
      <LiveQueueRefresh />
      <LiveQueueWorkspace
        key={selectedBranchId}
        role={role}
        businessName={business.name}
        selectedBranchId={selectedBranchId}
        selectedBranch={{
          id: selectedBranch.id,
          name: selectedBranch.name,
          address: selectedBranch.address,
        }}
        branches={branches.map((branch) => ({
          id: branch.id,
          name: branch.name,
          address: branch.address,
        }))}
        services={servicesWithQr}
        initialServiceId={params.service ?? null}
        tickets={clientTickets}
        canEditName={Boolean(canEditName)}
        canEditMobile={Boolean(canEditMobile)}
        successMessage={params.success}
        errorMessage={params.error}
      />
    </>
  );
}
