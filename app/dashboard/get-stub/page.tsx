import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function GetStubLauncherPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/login?next=%2Fdashboard%2Fget-stub");

  const { data: membership } = await supabase.from("business_users")
    .select("business_id,role")
    .eq("user_id", userData.user.id).eq("is_active", true).limit(1).maybeSingle();
  if (!membership) redirect("/dashboard");

  let branchIds: string[] = [];
  if (membership.role === "owner" || membership.role === "admin") {
    const { data: branches } = await supabase.from("branches").select("id").eq("business_id", membership.business_id);
    branchIds = (branches ?? []).map((branch) => branch.id);
  } else {
    const { data: assignments } = await supabase.from("branch_users").select("branch_id").eq("user_id", userData.user.id);
    branchIds = (assignments ?? []).map((assignment) => assignment.branch_id);
  }

  const { data: terminals } = branchIds.length
    ? await supabase.from("devices")
        .select("id,name,device_token,branch_id,service_id,branches(name),services(name)")
        .in("branch_id", branchIds).eq("device_type", "ticket_terminal").eq("is_active", true).order("created_at")
    : { data: [] as any[] };

  if ((terminals ?? []).length === 1) {
    redirect(`/kiosk/${terminals![0].device_token}?from=dashboard`);
  }

  return (
    <div className="dashboard-content get-stub-launcher">
      <header className="dashboard-header">
        <div><p className="eyebrow">Kiosk mode</p><h1>Get Stub</h1><p className="muted">Choose which registered terminal this device should use.</p></div>
      </header>
      <section className="dashboard-section dashboard-section-stack">
        {(terminals ?? []).length ? <div className="get-stub-terminal-grid">{(terminals ?? []).map((terminal: any) => {
          const branch = Array.isArray(terminal.branches) ? terminal.branches[0] : terminal.branches;
          const service = Array.isArray(terminal.services) ? terminal.services[0] : terminal.services;
          return <Link key={terminal.id} className="get-stub-terminal-choice" href={`/kiosk/${terminal.device_token}?from=dashboard`}>
            <strong>{terminal.name}</strong><span>{branch?.name ?? "Branch"}</span><small>Default: {service?.name ?? "Service"}</small><b>Open Get Stub</b>
          </Link>;
        })}</div> : <div className="mini-empty"><strong>No Get Stub terminal is assigned to you.</strong><span>Ask an owner/admin to create a terminal in Dashboard → Terminals.</span></div>}
      </section>
    </div>
  );
}
