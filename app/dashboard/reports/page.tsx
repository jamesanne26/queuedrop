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
    .select("business_id, role, can_view_history, can_view_reports, can_export_reports, businesses(name)")
    .eq("user_id", userData.user.id).eq("is_active", true).limit(1).maybeSingle();
  if (!membership) redirect("/dashboard");

  const role = membership.role as Role;
  const businessWide = role === "owner" || role === "admin";
  const canViewHistory = businessWide || Boolean(membership.can_view_history);
  const canViewReports = businessWide || Boolean(membership.can_view_reports);
  if (!canViewHistory && !canViewReports) redirect("/dashboard");
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

  let q = supabase.from("tickets").select("id,display_number,status,joined_at,called_at,serving_at,completed_at,cancelled_at,branch_id,service_id,sms_phone, branches(name), services(name)")
    .in("branch_id", branchIds.length ? branchIds : ["00000000-0000-0000-0000-000000000000"])
    .gte("joined_at", `${from}T00:00:00`).lte("joined_at", `${to}T23:59:59.999`).order("joined_at", { ascending:false }).limit(500);
  if (branch !== "all") q = q.eq("branch_id", branch);
  if (service !== "all") q = q.eq("service_id", service);
  if (status !== "all") q = q.eq("status", status);
  if (!canViewReports) q = q.in("status", ["completed", "cancelled", "no_show"]);
  const { data: ticketData } = await q;
  const tickets = ticketData ?? [];

  const completed = tickets.filter((t) => t.status === "completed").length;
  const cancelled = tickets.filter((t) => t.status === "cancelled").length;
  const noShow = tickets.filter((t) => t.status === "no_show").length;
  const active = tickets.filter((t) => ["waiting", "called", "serving"].includes(t.status)).length;
  const completionRate = tickets.length ? Math.round((completed / tickets.length) * 100) : 0;
  const waitSamples = tickets
    .filter((t) => t.called_at)
    .map((t) => Math.max(0, new Date(t.called_at!).getTime() - new Date(t.joined_at).getTime()));
  const avgWaitMinutes = waitSamples.length ? Math.round(waitSamples.reduce((sum, value) => sum + value, 0) / waitSamples.length / 60000) : 0;
  const business = Array.isArray(membership.businesses) ? membership.businesses[0] : membership.businesses;
  const businessName = business?.name ?? "QueueDrop";
  const selectedBranchName = branch === "all" ? "All branches" : branches.find((item) => item.id === branch)?.name ?? "Selected branch";
  const selectedServiceName = service === "all" ? "All services" : services.find((item) => item.id === service)?.name ?? "Selected service";
  const periodLabel = `${new Date(`${from}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} – ${new Date(`${to}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  const exportBase = new URLSearchParams({ from, to, branch, service, status, report });
  return <section className="dashboard-content reports-page">
    <header className="reports-hero">
      <div className="reports-hero-copy">
        <p className="eyebrow">{businessName}</p>
        <h1>Reports</h1>
        <p className="muted page-lead">A clear view of queue activity, stub flow, and service performance across your business.</p>
        <div className="reports-context-row"><span>{periodLabel}</span><span>{selectedBranchName}</span><span>{selectedServiceName}</span></div>
      </div>
      {process.env.VERCEL_ENV === "production" ? null : <span className="env-badge">TEST</span>}
    </header>

    <form className="dashboard-section reports-filter-card" method="get">
      <div className="reports-card-heading"><div><p className="eyebrow">Report filters</p><h2>Refine your data</h2></div><p className="muted">Choose a period and narrow the report by branch, service, type, or status.</p></div>
      <div className="reports-filter-grid">
        <label>From<input type="date" name="from" defaultValue={from} /></label>
        <label>To<input type="date" name="to" defaultValue={to} /></label>
        <label>Branch<select name="branch" defaultValue={branch}><option value="all">All branches</option>{branches.map((b)=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>Service<select name="service" defaultValue={service}><option value="all">All services</option>{services.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Report type<select name="report" defaultValue={report}><option value="history">Detailed queue history</option><option value="summary">Queue summary</option><option value="service">Service performance</option></select></label>
        <label>Status<select name="status" defaultValue={status}><option value="all">All statuses</option><option value="waiting">Waiting</option><option value="called">Called</option><option value="serving">Serving</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="no_show">No show</option></select></label>
        <button className="button button-primary reports-apply-button" type="submit">Apply filters</button>
      </div>
    </form>

    {canViewReports ? <div className="reports-stat-grid">
      <article><span>Total stubs</span><strong>{tickets.length}</strong><small>In selected period</small></article>
      <article><span>Completed</span><strong>{completed}</strong><small>{completionRate}% completion rate</small></article>
      <article><span>Average wait</span><strong>{avgWaitMinutes}<em> min</em></strong><small>Based on called stubs</small></article>
      <article><span>Active queue</span><strong>{active}</strong><small>Waiting, called, or serving</small></article>
      <article><span>Cancelled</span><strong>{cancelled}</strong><small>Cancelled tickets</small></article>
      <article><span>No show</span><strong>{noShow}</strong><small>Stubs marked no show</small></article>
    </div> : null}

    <section className="dashboard-section reports-export-card">
      <div><p className="eyebrow">Export report</p><h2>{businessName} operational report</h2><p className="muted">Download the exact filtered view above with stub, branch, service, status, and queue timestamps.</p></div>
      {canExport ? <div className="reports-export-actions">{["txt","csv","pdf","docx","xlsx"].map((format)=><a key={format} className="button button-secondary" href={`/api/reports/export?${exportBase.toString()}&format=${format}`}>{format.toUpperCase()}</a>)}</div> : <p className="muted">Your account can view reports but export access is disabled.</p>}
    </section>

    <section className="dashboard-section reports-history-card">
      <div className="reports-history-heading"><div><p className="eyebrow">Queue history</p><h2>Stub activity</h2><p className="muted">{tickets.length} record{tickets.length===1?"":"s"} for {periodLabel}</p></div><span className="reports-record-limit">Showing up to 500 records</span></div>
      <div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>Joined</th><th>Queue</th><th>SMS</th><th>Branch</th><th>Service</th><th>Status</th><th>Called</th><th>Serving</th><th>Finished</th></tr></thead><tbody>{tickets.length ? tickets.map((t)=>{const b=Array.isArray(t.branches)?t.branches[0]:t.branches; const s=Array.isArray(t.services)?t.services[0]:t.services; const finished=t.completed_at||t.cancelled_at; return <tr key={t.id}><td>{new Date(t.joined_at).toLocaleString()}</td><td><strong className="reports-queue-code">{t.display_number}</strong></td><td>{t.sms_phone ? "Enabled" : "Stub only"}</td><td>{b?.name||"—"}</td><td>{s?.name||"—"}</td><td><span className={`status-chip reports-status-${t.status}`}>{t.status.replace("_", " ")}</span></td><td>{t.called_at?new Date(t.called_at).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }):"—"}</td><td>{t.serving_at?new Date(t.serving_at).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }):"—"}</td><td>{finished?new Date(finished).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }):"—"}</td></tr>}) : <tr><td colSpan={9} className="reports-empty-state"><strong>No queue records found</strong><span>Try changing the date range or filters above.</span></td></tr>}</tbody></table></div>
    </section>
  </section>;
}
