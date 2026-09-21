import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { maskSmsRecipient } from "@/lib/notifications/phone";
import { smsRuntimeConfig } from "@/lib/notifications/sms";
import { semaphoreHttpConfig, type SmsHttpProviderConfig } from "@/lib/notifications/sms-provider-config";
import {
  dispatchPendingSmsAction,
  retryFailedSmsAction,
  saveSmsMethodAction,
  saveSystemSmsRouteAction,
} from "./actions";

export const dynamic = "force-dynamic";

const DEFAULT_LOG_PAGE_SIZE = 10;
const LOG_PAGE_SIZE_OPTIONS = [10, 100, 1000] as const;

type PageProps = {
  searchParams: Promise<{
    outboxPage?: string;
    outboxSize?: string;
    attemptPage?: string;
    attemptSize?: string;
  }>;
};

type MethodRow = {
  id: string;
  name: string;
  method_type: string;
  provider_code: string | null;
  country_code: string;
  is_enabled: boolean;
  priority: number;
  api_base_url: string | null;
  secret_env_key: string | null;
  sender_name: string | null;
  cost_per_sms: number | null;
  currency: string | null;
  config: Record<string, unknown> | null;
};

function configFor(method: MethodRow): SmsHttpProviderConfig {
  if (method.config?.transport === "generic_http") return method.config as SmsHttpProviderConfig;
  if ((method.provider_code ?? "").toLowerCase() === "semaphore") return semaphoreHttpConfig();
  return { transport: "generic_http" };
}

function jsonField(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value as object).length === 0) return "";
  return JSON.stringify(value);
}

function secretStatus(method: MethodRow) {
  if (method.method_type !== "cloud_provider") return { label: "Device pairing", ok: true };
  if (!method.secret_env_key) return { label: "Server credential missing", ok: false };
  return process.env[method.secret_env_key]?.trim()
    ? { label: "Server credential configured", ok: true }
    : { label: "Server credential not configured", ok: false };
}

function pageNumber(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function pageSize(value: string | undefined) {
  const parsed = Number.parseInt(value ?? String(DEFAULT_LOG_PAGE_SIZE), 10);
  return LOG_PAGE_SIZE_OPTIONS.includes(parsed as (typeof LOG_PAGE_SIZE_OPTIONS)[number])
    ? parsed
    : DEFAULT_LOG_PAGE_SIZE;
}

function Pagination({
  kind, current, total, size,
}: {
  kind: "outbox" | "attempt";
  current: number;
  total: number;
  size: number;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const safeCurrent = Math.min(current, pages);
  const pageParam = kind === "outbox" ? "outboxPage" : "attemptPage";
  const sizeParam = kind === "outbox" ? "outboxSize" : "attemptSize";
  const hash = kind === "outbox" ? "sms-outbox" : "sms-attempts";
  const buildHref = (page: number) => `/system/sms?${pageParam}=${page}&${sizeParam}=${size}#${hash}`;
  return <nav className="sms-pagination" aria-label={`${kind} pagination`}>
    <Link aria-disabled={safeCurrent <= 1} className={safeCurrent <= 1 ? "is-disabled" : ""} href={buildHref(Math.max(1, safeCurrent - 1))}>Previous</Link>
    <span>Page {safeCurrent} of {pages}</span>
    <Link aria-disabled={safeCurrent >= pages} className={safeCurrent >= pages ? "is-disabled" : ""} href={buildHref(Math.min(pages, safeCurrent + 1))}>Next</Link>
  </nav>;
}

function PageSizePicker({ kind, size }: { kind: "outbox" | "attempt"; size: number }) {
  const sizeParam = kind === "outbox" ? "outboxSize" : "attemptSize";
  const pageParam = kind === "outbox" ? "outboxPage" : "attemptPage";
  const hash = kind === "outbox" ? "sms-outbox" : "sms-attempts";
  return <form className="sms-page-size" method="get" action={`/system/sms#${hash}`}>
    <input type="hidden" name={pageParam} value="1"/>
    <label>Show
      <select name={sizeParam} defaultValue={String(size)}>
        {LOG_PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      rows
    </label>
    <button className="button button-secondary" type="submit">Apply</button>
  </form>;
}

function ProviderFields({ method }: { method?: MethodRow }) {
  const config = method ? configFor(method) : ({ transport: "generic_http" } satisfies SmsHttpProviderConfig);
  return <>
    <div className="sms-config-grid sms-config-grid-primary">
      <label>Name<input name="name" defaultValue={method?.name ?? ""} placeholder="Provider name" required/></label>
      <label>Method<select name="method_type" defaultValue={method?.method_type ?? "cloud_provider"}><option value="cloud_provider">Cloud provider</option><option value="system_android">System Owner Android</option><option value="branch_android">Branch Android</option></select></label>
      <label>Provider code<input name="provider_code" defaultValue={method?.provider_code ?? ""} placeholder="semaphore / twilio / my_provider"/></label>
      <label>Country<input name="country_code" defaultValue={method?.country_code ?? "PH"} maxLength={2}/></label>
      <label>API URL<input name="api_base_url" defaultValue={method?.api_base_url ?? ""} placeholder="https://provider.example/messages"/></label>
      <label>Sender name<input name="sender_name" defaultValue={method?.sender_name ?? ""} placeholder="QueueDrop"/></label>
      <label>Cost / SMS<input name="cost_per_sms" type="number" step="0.0001" min="0" defaultValue={method?.cost_per_sms ?? ""}/></label>
      <label>Currency<input name="currency" defaultValue={method?.currency ?? "PHP"} maxLength={3}/></label>
      <label>Priority<input name="priority" type="number" min="1" defaultValue={method?.priority ?? 100}/></label>
      <label className="sms-check"><input name="is_enabled" type="checkbox" defaultChecked={method?.is_enabled ?? true}/>Enabled</label>
    </div>
    <details className="sms-advanced">
      <summary>Advanced HTTP adapter settings</summary>
      <p className="muted">Only non-secret request mappings are stored here. API keys and tokens never appear in this UI or in QueueDrop database records.</p>
      <div className="sms-config-grid">
        <label>HTTP method<select name="http_method" defaultValue={config.http_method ?? "POST"}><option value="POST">POST</option><option value="GET">GET</option></select></label>
        <label>Body format<select name="body_format" defaultValue={config.body_format ?? "form"}><option value="form">Form URL encoded</option><option value="json">JSON</option></select></label>
        <label>Credential placement<select name="api_key_location" defaultValue={config.api_key_location ?? "body"}><option value="body">Request body</option><option value="header">Header</option><option value="query">Query string</option><option value="bearer">Authorization: Bearer</option><option value="basic">Authorization: Basic</option></select></label>
        <label>Credential parameter name<input name="api_key_field" defaultValue={config.api_key_field ?? "apikey"} placeholder="apikey / X-API-Key"/></label>
        <label>Basic auth username<input name="api_key_username" defaultValue={config.api_key_username ?? ""} placeholder="Account SID / username"/></label>
        <label>Credential prefix (non-secret)<input name="api_key_prefix" defaultValue={config.api_key_prefix ?? ""} placeholder="Optional, e.g. Token "/></label>
        <label>Recipient field<input name="recipient_field" defaultValue={config.recipient_field ?? "number"} placeholder="number / to"/></label>
        <label>Message field<input name="message_field" defaultValue={config.message_field ?? "message"} placeholder="message / body"/></label>
        <label>Sender field<input name="sender_field" defaultValue={config.sender_field ?? "sendername"} placeholder="sendername / from"/></label>
        <label>Provider message-ID path<input name="response_message_id_path" defaultValue={config.response_message_id_path ?? ""} placeholder="0.message_id / data.id"/></label>
        <label>Static params (JSON)<input name="static_params" defaultValue={jsonField(config.static_params)} placeholder={'{"type":"text"}'}/></label>
        <label>Extra headers (JSON)<input name="headers" defaultValue={jsonField(config.headers)} placeholder={'{"Accept":"application/json"}'}/></label>
      </div>
    </details>
  </>;
}

export default async function SmsManagementPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const outboxPage = pageNumber(query.outboxPage);
  const attemptPage = pageNumber(query.attemptPage);
  const outboxSize = pageSize(query.outboxSize);
  const attemptSize = pageSize(query.attemptSize);
  const outboxFrom = (outboxPage - 1) * outboxSize;
  const attemptFrom = (attemptPage - 1) * attemptSize;
  const admin = createAdminClient();

  const [
    { data: methods }, { data: routes }, { data: devices },
    { data: outboxRows, count: outboxTotal }, { data: attemptRows, count: attemptTotal },
    pendingCount, processingCount, sentCount, failedCount,
  ] = await Promise.all([
    admin.from("sms_delivery_methods").select("*").order("country_code").order("priority"),
    admin.from("sms_routing_rules").select("*").order("created_at"),
    admin.from("sms_gateway_devices").select("*").order("created_at", { ascending: false }).limit(20),
    admin.from("notifications").select("id,recipient,message,status,attempt_count,last_error,provider_message_id,created_at,sent_at", { count: "exact" }).eq("channel", "sms").order("created_at", { ascending: false }).range(outboxFrom, outboxFrom + outboxSize - 1),
    admin.from("sms_delivery_attempts").select("id,notification_id,status,attempt_number,provider_message_id,error_message,created_at,finished_at,sms_delivery_methods(name)", { count: "exact" }).order("created_at", { ascending: false }).range(attemptFrom, attemptFrom + attemptSize - 1),
    admin.from("notifications").select("id", { count: "exact", head: true }).eq("channel", "sms").eq("status", "pending"),
    admin.from("notifications").select("id", { count: "exact", head: true }).eq("channel", "sms").eq("status", "processing"),
    admin.from("notifications").select("id", { count: "exact", head: true }).eq("channel", "sms").eq("status", "sent"),
    admin.from("notifications").select("id", { count: "exact", head: true }).eq("channel", "sms").eq("status", "failed"),
  ]);

  const list = (methods ?? []) as MethodRow[];
  const phRoute = (routes ?? []).find((route) => route.scope_type === "country" && route.country_code === "PH");
  const runtime = smsRuntimeConfig();

  return <section className="system-content sms-system-page">
    <div className="system-hero">
      <div><p className="eyebrow">Notification delivery</p><h1>SMS routing & delivery</h1>
      <p className="muted">Switch standard REST SMS providers from this console. QueueDrop stores routing and request mappings only; provider credentials stay server-side.</p></div>
      <span className="env-badge">{runtime.dryRun ? "DRY RUN" : "LIVE DELIVERY"}</span>
    </div>

    <section className="system-panel">
      <div className="system-panel-title"><div><p className="eyebrow">Runtime health</p><h2>Dispatcher status</h2></div></div>
      <div className="metric-grid">
        <article className="metric-card"><span>Pending</span><strong>{pendingCount.count ?? 0}</strong></article>
        <article className="metric-card"><span>Processing</span><strong>{processingCount.count ?? 0}</strong></article>
        <article className="metric-card"><span>Sent</span><strong>{sentCount.count ?? 0}</strong></article>
        <article className="metric-card"><span>Failed</span><strong>{failedCount.count ?? 0}</strong></article>
      </div>
      <div className="sms-runtime-row">
        <p className="muted">Dispatcher: <strong>{runtime.dispatcherSecretConfigured ? "Configured" : "Missing"}</strong> · Mode: <strong>{runtime.dryRun ? "Simulated — no paid SMS" : "Live delivery"}</strong></p>
        <div className="button-row"><form action={dispatchPendingSmsAction}><button className="button button-primary" type="submit">Dispatch pending</button></form><form action={retryFailedSmsAction}><button className="button button-secondary" type="submit">Retry failed</button></form></div>
      </div>
    </section>

    <section className="system-panel">
      <div className="system-panel-title"><div><p className="eyebrow">Philippines</p><h2>Default route</h2></div><span className="muted">Saved primary: <strong>{list.find((method) => method.id === phRoute?.primary_method_id)?.name ?? "None"}</strong></span></div>
      <form action={saveSystemSmsRouteAction} className="sms-config-grid">
        <label>Country<input name="country_code" defaultValue="PH" maxLength={2}/></label>
        <label>Primary method<select name="primary_method_id" defaultValue={phRoute?.primary_method_id ?? ""} required><option value="">Select method</option>{list.filter((method) => method.country_code === "PH" && method.is_enabled).map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label>
        <label>Routing policy<select name="routing_policy" defaultValue={phRoute?.routing_policy ?? "manual_priority"}><option value="manual_priority">Primary + fallback chain</option><option value="branch_owned_first">Branch-owned first</option><option value="cloud_only">Cloud only</option><option value="android_only">Android only</option><option value="cheapest">Cheapest enabled</option><option value="most_reliable">Most reliable</option></select></label>
        <label>Retry limit<input name="retry_limit" type="number" min="0" max="10" defaultValue={phRoute?.retry_limit ?? 2}/></label>
        <label>Fail over after (seconds)<input name="failover_after_seconds" type="number" min="5" max="600" defaultValue={phRoute?.failover_after_seconds ?? 30}/></label>
        <fieldset><legend>Fallback chain</legend>{list.filter((method) => method.country_code === "PH" && method.is_enabled).map((method) => <label className="sms-check" key={method.id}><input type="checkbox" name="fallback_method_ids" value={method.id} defaultChecked={(phRoute?.fallback_method_ids ?? []).includes(method.id)}/>{method.name}</label>)}</fieldset>
        <button className="button button-primary" type="submit">Save PH routing</button>
      </form>
    </section>

    <section className="system-panel">
      <div className="system-panel-title"><div><p className="eyebrow">Delivery methods</p><h2>Providers & gateways</h2></div><div className="button-row"><span>{list.length} configured</span><a className="button button-primary" href="#add-sms-provider">Add provider</a></div></div>
      <div className="sms-security-note"><strong>Credentials are server-only.</strong><span>No API key, token, or password is displayed, accepted, or stored by this screen. New cloud providers automatically receive a server credential reference based on their provider code.</span></div>
      <div className="sms-method-list">
        {list.map((method) => {
          const status = secretStatus(method);
          return <details className="sms-method-card" key={method.id}>
            <summary><span><strong>{method.name}</strong><small>{method.provider_code ?? method.method_type} · {method.country_code} · Priority {method.priority}</small></span><span className={`sms-status-pill ${status.ok ? "is-ok" : "is-warning"}`}>{method.is_enabled ? status.label : "Disabled"}</span></summary>
            <form action={saveSmsMethodAction} className="sms-method-form">
              <input type="hidden" name="id" value={method.id}/>
              <ProviderFields method={method}/>
              <div className="button-row"><button className="button button-primary" type="submit">Save provider</button></div>
            </form>
          </details>;
        })}
      </div>
    </section>

    <section className="system-panel sms-log-launcher">
      <div className="system-panel-title"><div><p className="eyebrow">Operations</p><h2>SMS logs</h2></div></div>
      <p className="muted">Logs are kept out of the main configuration screen. Open a paginated window when you need to inspect delivery history.</p>
      <div className="sms-log-cards">
        <article><span>Notifications</span><strong>{outboxTotal ?? 0}</strong><a className="button button-secondary" href="#sms-outbox">View outbox</a></article>
        <article><span>Delivery attempts</span><strong>{attemptTotal ?? 0}</strong><a className="button button-secondary" href="#sms-attempts">View audit</a></article>
        <article><span>Android gateways</span><strong>{devices?.length ?? 0}</strong><a className="button button-secondary" href="#sms-devices">View devices</a></article>
      </div>
    </section>

    <div id="add-sms-provider" className="sms-modal-overlay">
      <section className="sms-modal" role="dialog" aria-modal="true" aria-labelledby="add-provider-title">
        <div className="sms-modal-header"><div><p className="eyebrow">Delivery method</p><h2 id="add-provider-title">Add SMS provider</h2></div><a className="sms-modal-close" href="/system/sms" aria-label="Close">×</a></div>
        <p className="muted">For standard HTTPS SMS APIs, configure the request here. The real API credential must be added separately to the server environment and is never entered in QueueDrop UI.</p>
        <form action={saveSmsMethodAction} className="sms-method-form"><ProviderFields/><div className="button-row"><button className="button button-primary" type="submit">Add delivery method</button><a className="button button-secondary" href="/system/sms">Cancel</a></div></form>
      </section>
    </div>

    <div id="sms-outbox" className="sms-modal-overlay">
      <section className="sms-modal sms-modal-wide" role="dialog" aria-modal="true" aria-labelledby="outbox-title">
        <div className="sms-modal-header"><div><p className="eyebrow">Recent outbox</p><h2 id="outbox-title">SMS notifications</h2><p className="muted">{outboxTotal ?? 0} total records</p></div><a className="sms-modal-close" href="/system/sms" aria-label="Close">×</a></div>
        <div className="sms-log-toolbar"><PageSizePicker kind="outbox" size={outboxSize}/></div>
        {outboxRows?.length ? <div className="system-table-wrap"><table className="system-table"><thead><tr><th>Recipient</th><th>Message</th><th>Status</th><th>Attempts</th><th>Provider ID / Error</th><th>Created</th></tr></thead><tbody>{outboxRows.map((notification) => <tr key={notification.id}><td><strong>{maskSmsRecipient(notification.recipient)}</strong></td><td className="sms-message-cell">{notification.message}</td><td>{notification.status}</td><td>{notification.attempt_count ?? 0}</td><td>{notification.provider_message_id ?? notification.last_error ?? "—"}</td><td>{new Date(notification.created_at).toLocaleString("en-PH")}</td></tr>)}</tbody></table></div> : <p className="muted">No SMS jobs yet.</p>}
        <Pagination kind="outbox" current={outboxPage} total={outboxTotal ?? 0} size={outboxSize}/>
      </section>
    </div>

    <div id="sms-attempts" className="sms-modal-overlay">
      <section className="sms-modal sms-modal-wide" role="dialog" aria-modal="true" aria-labelledby="attempts-title">
        <div className="sms-modal-header"><div><p className="eyebrow">Delivery audit</p><h2 id="attempts-title">SMS delivery attempts</h2><p className="muted">{attemptTotal ?? 0} total records</p></div><a className="sms-modal-close" href="/system/sms" aria-label="Close">×</a></div>
        <div className="sms-log-toolbar"><PageSizePicker kind="attempt" size={attemptSize}/></div>
        {attemptRows?.length ? <div className="system-table-wrap"><table className="system-table"><thead><tr><th>Method</th><th>Attempt</th><th>Status</th><th>Provider ID</th><th>Error</th><th>Time</th></tr></thead><tbody>{attemptRows.map((attempt) => { const relation = Array.isArray(attempt.sms_delivery_methods) ? attempt.sms_delivery_methods[0] : attempt.sms_delivery_methods; return <tr key={attempt.id}><td>{relation?.name ?? "—"}</td><td>{attempt.attempt_number}</td><td>{attempt.status}</td><td>{attempt.provider_message_id ?? "—"}</td><td>{attempt.error_message ?? "—"}</td><td>{new Date(attempt.created_at).toLocaleString("en-PH")}</td></tr>; })}</tbody></table></div> : <p className="muted">No delivery attempts yet.</p>}
        <Pagination kind="attempt" current={attemptPage} total={attemptTotal ?? 0} size={attemptSize}/>
      </section>
    </div>

    <div id="sms-devices" className="sms-modal-overlay">
      <section className="sms-modal sms-modal-wide" role="dialog" aria-modal="true" aria-labelledby="devices-title">
        <div className="sms-modal-header"><div><p className="eyebrow">Android gateways</p><h2 id="devices-title">Paired devices</h2></div><a className="sms-modal-close" href="/system/sms" aria-label="Close">×</a></div>
        {devices?.length ? <div className="system-table-wrap"><table className="system-table"><thead><tr><th>Device</th><th>Scope</th><th>Carrier</th><th>Status</th><th>Last seen</th></tr></thead><tbody>{devices.map((device) => <tr key={device.id}><td><strong>{device.name}</strong><small>{device.phone_number ?? "No SIM number"}</small></td><td>{device.owner_scope}</td><td>{device.carrier ?? "—"}</td><td>{device.status}</td><td>{device.last_seen_at ? new Date(device.last_seen_at).toLocaleString("en-PH") : "Never"}</td></tr>)}</tbody></table></div> : <p className="muted">No Android gateway paired yet.</p>}
      </section>
    </div>
  </section>;
}
