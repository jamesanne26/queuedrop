import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSystemOwner } from "@/lib/auth/system-owner";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || !(await isSystemOwner(data.user))) redirect("/dashboard");
  const admin = createAdminClient();
  const [workers, prints, sms, devices] = await Promise.all([
    admin.from("worker_runs").select("*").order("name"),
    admin.from("print_jobs").select("id,branch_id,status,attempt_count,error_message,updated_at")
      .in("status", ["failed", "uncertain"]).order("updated_at", { ascending: false }).limit(50),
    admin.from("notifications").select("id,branch_id,status,last_error,created_at")
      .eq("channel", "sms").in("status", ["pending", "processing", "failed"]).order("created_at").limit(50),
    admin.from("devices").select("id,name,branch_id,last_seen_at").eq("is_active", true).order("last_seen_at", { ascending: true, nullsFirst: true }).limit(50),
  ]);
  const errors = [workers, prints, sms, devices].some((result) => result.error);
  return <section className="system-content">
    <h1>Operations</h1>
    <p className="muted">Last worker runs and up to 50 entries per list. Last seen means the device contacted QueueDrop; it does not confirm printer readiness.</p>
    {errors ? <div className="notice notice-error">Some diagnostics are unavailable. Check the TEST migration and database connection.</div> : null}
    <h2>Workers</h2>
    {(workers.data ?? []).map((w) => <p key={w.name}><strong>{w.name}</strong> · Last success: {w.last_succeeded_at ?? "Never"} · {w.last_error ?? "No recorded error"}</p>)}
    {!workers.data?.length ? <p>No worker heartbeat recorded. Configure the operations scheduler.</p> : null}
    <h2>Print jobs needing attention</h2>
    {(prints.data ?? []).map((j) => <p key={j.id}>{j.branch_id} · {j.status} · Attempts: {j.attempt_count} · {j.error_message}</p>)}
    <h2>SMS backlog and failures</h2>
    {(sms.data ?? []).map((j) => <p key={j.id}>{j.branch_id} · {j.status} · Created: {j.created_at} · {j.last_error}</p>)}
    <h2>Device connections</h2>
    {(devices.data ?? []).map((d) => <p key={d.id}>{d.name} · {d.branch_id} · Last seen: {d.last_seen_at ?? "Never"}</p>)}
  </section>;
}
