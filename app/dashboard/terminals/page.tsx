import { reprintStub } from "./print-actions";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteTerminal, updateKioskExitPin, updateTerminal } from "./actions";
import { TerminalForm } from "./terminal-form";
import { CreateTerminalForm } from "./create-terminal-form";
import { CopyTokenButton } from "./copy-token-button";

type Props = { searchParams: Promise<{ message?: string; error?: string }> };

export default async function TerminalsPage({ searchParams }: Props) {
  const notices = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/login?next=%2Fdashboard%2Fterminals");

  const { data: membership } = await supabase.from("business_users")
    .select("business_id,role")
    .eq("user_id", userData.user.id).eq("is_active", true).limit(1).maybeSingle();
  if (!membership || !["owner","admin"].includes(membership.role)) redirect("/dashboard");

  const { data: branches } = await supabase.from("branches")
    .select("id,name,kiosk_exit_pin_hash,services(id,name,is_active)")
    .eq("business_id", membership.business_id).order("name");
  const safeBranches = (branches ?? []).map((branch) => ({ ...branch, services: branch.services ?? [] }));
  const branchIds = safeBranches.map((b) => b.id);
  const { data: terminals } = branchIds.length ? await supabase.from("devices")
    .select("id,name,device_token,is_active,last_seen_at,branch_id,service_id,branches(name),services(name)")
    .in("branch_id", branchIds).eq("device_type", "ticket_terminal").order("created_at") : { data: [] as never[] };

  const { data: printJobs, error: printError } = branchIds.length ? await supabase.from("print_jobs")
    .select("id,status,attempt_count,error_message,created_at,tickets(display_number,status),branches(name)")
    .in("branch_id", branchIds).in("status", ["failed", "uncertain"])
    .order("created_at", { ascending: false }).limit(50) : { data: [], error: null };

  return <div className="dashboard-content terminals-page">
    <div className="page-heading"><div><p className="eyebrow">Hardware & browser kiosk</p><h1>QueueDrop Terminals</h1><p className="muted">Each terminal belongs to one branch and has a default service. Multiple terminals may use the same default service, and Get Stub customers can choose another active service in that branch.</p></div></div>
    {notices.message ? <div className="notice notice-success">{notices.message}</div> : null}
    {notices.error ? <div className="notice notice-error">{notices.error}</div> : null}

    <section className="dashboard-section dashboard-section-stack">
      <h2>Print jobs needing attention</h2>
      <p className="muted">Latest 50 failed or unconfirmed jobs. Check whether paper already came out before requesting the same stub again.</p>
      {printError ? <p className="notice notice-error">Print diagnostics unavailable. Check the database migration.</p> : null}
      {(printJobs ?? []).map((job) => {
        const ticket = Array.isArray(job.tickets) ? job.tickets[0] : job.tickets;
        const branch = Array.isArray(job.branches) ? job.branches[0] : job.branches;
        return <article className="terminal-card" key={job.id}>
          <strong>{ticket?.display_number ?? "Stub"} · {branch?.name ?? "Branch"}</strong>
          <p>{job.status === "uncertain" ? "Print confirmation missing — check paper" : "Print failed"} · Attempts: {job.attempt_count}</p>
          <p className="muted">{job.error_message}</p>
          {["waiting", "called", "serving"].includes(ticket?.status ?? "") ? <form action={reprintStub}>
            <input type="hidden" name="job_id" value={job.id} />
            <label><input type="checkbox" name="checked_paper" value="yes" required /> I checked the printer and need another copy of this stub.</label>
            <button className="button button-secondary" type="submit">Reprint same stub</button>
          </form> : <p>Ticket is no longer active.</p>}
        </article>;
      })}
      {!printJobs?.length && !printError ? <p>No failed or unconfirmed print jobs.</p> : null}
    </section>

    <section id="kiosk-security" className="dashboard-section dashboard-section-stack settings-card kiosk-security-card terminal-security-card">
      <div>
        <p className="eyebrow">Terminal security</p>
        <h2>Kiosk PIN security</h2>
        <p className="muted">Exit PINs are configured per branch so each location can protect its own QueueDrop terminals.</p>
      </div>
      <div className="kiosk-pin-status">
        <strong>Branch-specific PIN</strong>
        <span>Select the branch whose terminal exit PIN you want to set or replace.</span>
      </div>
      <form action={updateKioskExitPin} className="kiosk-pin-form">
        <label>Branch<select name="branch_id" required defaultValue={safeBranches[0]?.id ?? ""}><option value="" disabled>Select branch</option>{safeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.kiosk_exit_pin_hash ? " · PIN configured" : " · No PIN"}</option>)}</select></label>
        <label>New PIN<input name="kiosk_exit_pin" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,8}" minLength={4} maxLength={8} required placeholder="4–8 digits" /></label>
        <label>Confirm PIN<input name="kiosk_exit_pin_confirm" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,8}" minLength={4} maxLength={8} required placeholder="Repeat PIN" /></label>
        <button className="button button-primary" type="submit" disabled={!safeBranches.length}>Save PIN</button>
      </form>
    </section>

    <section className="dashboard-section dashboard-section-stack">
      <div><h2>Add terminal</h2><p className="muted">Select the branch first, then choose the service that should be preselected by default. The same service can be the default on more than one terminal.</p></div>
      <CreateTerminalForm branches={safeBranches} />
    </section>

    <section className="dashboard-section dashboard-section-stack">
      <div><h2>Registered terminals</h2><p className="muted">Use Open Terminal as the single launcher for this device. The terminal keeps its branch and default-service setup; the registered terminal remains the single launcher for its assigned branch and default service.</p></div>
      <div className="terminal-list">
        {(terminals ?? []).length ? (terminals ?? []).map((t)=>{
          const branch=Array.isArray(t.branches)?t.branches[0]:t.branches; const service=Array.isArray(t.services)?t.services[0]:t.services;
          return <article className="terminal-card terminal-card-editable" key={t.id}>
            <div className="terminal-card-summary"><div><strong>{t.name}</strong><span>{branch?.name ?? "Branch not assigned"} · {service?.name ?? "Service not assigned"}</span></div><small>{t.last_seen_at ? `Last seen ${new Date(t.last_seen_at).toLocaleString()}` : "Not connected yet"}</small></div>
            <details className="terminal-assignment-panel"><summary>Branch & default service</summary><TerminalForm branches={safeBranches} action={updateTerminal} submitLabel="Save assignment" terminalId={t.id} defaultName={t.name} defaultBranchId={t.branch_id} defaultServiceId={t.service_id ?? ""} compact /></details>
            <div className="terminal-mode-links"><a className="button button-secondary" href={`/kiosk/${t.device_token}?from=dashboard`}>Open Terminal</a></div>
            <div className="terminal-token-panel"><span>Device token for Android APK</span><code>{t.device_token}</code><CopyTokenButton token={t.device_token} /></div>
            <form action={deleteTerminal}><input type="hidden" name="id" value={t.id}/><button className="button button-danger" type="submit">Remove</button></form>
          </article>;
        }) : <div className="mini-empty"><strong>No ticket terminals yet.</strong><span>Create your first QueueDrop terminal above.</span></div>}
      </div>
    </section>
  </div>;
}
