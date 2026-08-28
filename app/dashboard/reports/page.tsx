import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Props = { searchParams: Promise<Record<string, string | undefined>> };
type Role = "owner" | "admin" | "manager" | "staff";

function dateOnly(value: string | undefined, fallback: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value! : fallback;
}

export default async function ReportsPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/login?next=%2Fdashboard%2Freports");

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, role, can_view_reports, can_export_reports, businesses(name)")
    .eq("user_id", userData.user.id).eq("is_active", true).limit(1).maybeSingle();
  if (!membership) redirect("/dashboard");

  const role = membership.role as Role;
  const businessWide = role === "owner" || role === "admin";
  if (!businessWide && !membership.can_view_reports) redirect("/dashboard");
  const canExport = businessWide || Boolean(membership.can_export_reports);

  let allowedBranchIds: string[] | null = null;
  if (!businessWide) {
    const { data } = await supabase.from("branch_users").select("branch_id").eq("user_id", userData.user.id);
    allowedBranchIds = (data ?? []).map((x) => x.branch_id);
  }

  let branchQuery = supabase.from("branches").select("id,name").eq("business_id", membership.business_id).order("name");
  if (allowedBranchIds) branchQuery = branchQuery.in("id", allowedBranchIds.length ? allowedBranchIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: branchData } = await branchQuery;
  const branches = branchData ?? [];
  const branchIds = branches.map((b) => b.id);
  const serviceResult = branchIds.length
    ? await supabase.from("services").select("id,name,branch_id").in("branch_id", branchIds).order("name")
    : { data: [] };
  const services = serviceResult.data ?? [];

  const today = new Date();
  const startDefault = new Date(today.getTime() - 6 * 86400000).toISOString().slice(0,10);
  const endDefault = today.toISOString().slice(0,10);
  const from = dateOnly(params.from, startDefault);
  const to = dateOnly(params.to, endDefault);
  const branch = branchIds.includes(params.branch ?? "") ? params.branch! : "all";
  const service = services.some((s) => s.id === params.service) ? params.service! : "all";
  const status = ["all","waiting","called","serving","completed","cancelled","no_show"].includes(params.status ?? "") ? params.status! : "all";
  const report = ["history","summary","service"].includes(params.report ?? "") ? params.report! : "history";

  let q = supabase.from("tickets").select("id,display_number,status,joined_at,called_at,serving_at,completed_at,cancelled_at,branch_id,service_id,customer_name_override,customer_phone_override, branches(name), services(name), customers(name,phone)")
    .in("branch_id", branchIds.length ? branchIds : ["00000000-0000-0000-0000-000000000000"])
    .gte("joined_at", `${from}T00:00:00`).lte("joined_at", `${to}T23:59:59.999`).order("joined_at", { ascending:false }).limit(500);
  if (branch !== "all") q = q.eq("branch_id", branch);
  if (service !== "all") q = q.eq("service_id", service);
  if (status !== "all") q = q.eq("status", status);
  const { data: ticketData } = await q;
  const tickets = ticketData ?? [];

  const completed = tickets.filter((t) => t.status === "completed").length;
  const cancelled = tickets.filter((t) => t.status === "cancelled").length;
  const noShow = tickets.filter((t) => t.status === "no_show").length;
  const business = Array.isArray(membership.businesses) ? membership.businesses[0] : membership.businesses;

  const exportBase = new URLSearchParams({ from, to, branch, service, status, report });
  return <section className="dashboard-content reports-page">
    <header className="dashboard-header"><div><p className="eyebrow">History & reports</p><h1>{business?.name ?? "QueueDrop"}</h1><p className="muted page-lead">Review queue history, filter operational data, and export a report for the selected period.</p></div><span className="env-badge">TEST</span></header>

    <form className="dashboard-section reports-filter-card" method="get">
      <label>From<input type="date" name="from" defaultValue={from} /></label>
      <label>To<input type="date" name="to" defaultValue={to} /></label>
      <label>Branch<select name="branch" defaultValue={branch}><option value="all">All branches</option>{branches.map((b)=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label>Service<select name="service" defaultValue={service}><option value="all">All services</option>{services.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>Report<select name="report" defaultValue={report}><option value="history">Detailed queue history</option><option value="summary">Queue summary</option><option value="service">Service performance</option></select></label><label>Status<select name="status" defaultValue={status}><option value="all">All statuses</option><option value="waiting">Waiting</option><option value="called">Called</option><option value="serving">Serving</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="no_show">No show</option></select></label>
      <button className="button button-primary" type="submit">Apply filters</button>
    </form>

    <div className="reports-stat-grid"><article><span>Total tickets</span><strong>{tickets.length}</strong></article><article><span>Completed</span><strong>{completed}</strong></article><article><span>Cancelled</span><strong>{cancelled}</strong></article><article><span>No show</span><strong>{noShow}</strong></article></div>

    <section className="dashboard-section reports-export-card"><div><p className="eyebrow">Generate report</p><h2>Operational queue report</h2><p className="muted">Exports the exact date, branch, service and status filters above. Includes ticket number, customer, contact, branch, service, status and queue timestamps.</p></div>{canExport ? <div className="reports-export-actions">{["txt","csv","pdf","docx","xlsx"].map((format)=><a key={format} className="button button-secondary" href={`/api/reports/export?${exportBase.toString()}&format=${format}`}>{format.toUpperCase()}</a>)}</div> : <p className="muted">Your account can view reports but export access is disabled.</p>}</section>

    <section className="dashboard-section reports-history-card"><div className="reports-history-heading"><div><p className="eyebrow">Queue history</p><h2>{tickets.length} record{tickets.length===1?"":"s"}</h2></div><span className="muted">Showing up to 500 records</span></div><div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>Joined</th><th>Queue</th><th>Customer</th><th>Branch</th><th>Service</th><th>Status</th><th>Called</th><th>Serving</th><th>Finished</th></tr></thead><tbody>{tickets.map((t:any)=>{const c=Array.isArray(t.customers)?t.customers[0]:t.customers; const b=Array.isArray(t.branches)?t.branches[0]:t.branches; const s=Array.isArray(t.services)?t.services[0]:t.services; const finished=t.completed_at||t.cancelled_at; return <tr key={t.id}><td>{new Date(t.joined_at).toLocaleString()}</td><td><strong>{t.display_number}</strong></td><td>{t.customer_name_override||c?.name||"—"}<small>{t.customer_phone_override||c?.phone||""}</small></td><td>{b?.name||"—"}</td><td>{s?.name||"—"}</td><td><span className="status-chip">{t.status}</span></td><td>{t.called_at?new Date(t.called_at).toLocaleTimeString():"—"}</td><td>{t.serving_at?new Date(t.serving_at).toLocaleTimeString():"—"}</td><td>{finished?new Date(finished).toLocaleTimeString():"—"}</td></tr>})}</tbody></table></div></section>
  </section>;
}
