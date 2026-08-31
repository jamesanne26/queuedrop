import { createAdminClient } from "@/lib/supabase/admin";
import { saveSmsMethodAction, saveSystemSmsRouteAction } from "./actions";

export default async function SmsManagementPage() {
  const admin = createAdminClient();
  const [{ data: methods }, { data: routes }, { data: devices }] = await Promise.all([
    admin.from("sms_delivery_methods").select("*").order("country_code").order("priority"),
    admin.from("sms_routing_rules").select("*").order("created_at"),
    admin.from("sms_gateway_devices").select("*").order("created_at", { ascending: false }),
  ]);
  const list = methods ?? [];
  const phRoute = (routes ?? []).find((r) => r.scope_type === "country" && r.country_code === "PH");

  return <section className="system-content">
    <div className="system-hero">
      <div><p className="eyebrow">Notification delivery</p><h1>SMS routing</h1>
      <p className="muted">Choose cloud providers or Android gateways per country, with ordered fallbacks. API secrets stay in environment variables; QueueDrop stores only the secret variable name.</p></div>
      <span className="env-badge">FLEXIBLE ROUTING</span>
    </div>

    <section className="system-panel">
      <div className="system-panel-title"><div><p className="eyebrow">Philippines</p><h2>Default route</h2></div></div>
      <form action={saveSystemSmsRouteAction} className="sms-config-grid">
        <label>Country<input name="country_code" defaultValue="PH" maxLength={2}/></label>
        <label>Primary method<select name="primary_method_id" defaultValue={phRoute?.primary_method_id ?? ""}>
          <option value="">Select method</option>{list.filter(m=>m.country_code==="PH" && m.is_enabled).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
        </select></label>
        <label>Routing policy<select name="routing_policy" defaultValue={phRoute?.routing_policy ?? "manual_priority"}>
          <option value="manual_priority">Manual priority</option><option value="branch_owned_first">Branch-owned first</option>
          <option value="cloud_only">Cloud only</option><option value="android_only">Android only</option>
          <option value="cheapest">Cheapest healthy route</option><option value="most_reliable">Most reliable</option>
        </select></label>
        <label>Retry limit<input name="retry_limit" type="number" min="0" max="10" defaultValue={phRoute?.retry_limit ?? 2}/></label>
        <label>Fail over after (seconds)<input name="failover_after_seconds" type="number" min="5" max="600" defaultValue={phRoute?.failover_after_seconds ?? 30}/></label>
        <fieldset><legend>Fallback chain</legend>{list.filter(m=>m.country_code==="PH" && m.is_enabled).map(m=>
          <label className="sms-check" key={m.id}><input type="checkbox" name="fallback_method_ids" value={m.id}
            defaultChecked={(phRoute?.fallback_method_ids ?? []).includes(m.id)}/>{m.name}</label>)}</fieldset>
        <button className="button button-primary" type="submit">Save PH routing</button>
      </form>
    </section>

    <section className="system-panel">
      <div className="system-panel-title"><div><p className="eyebrow">Delivery methods</p><h2>Providers & gateways</h2></div><span>{list.length} configured</span></div>
      <div className="system-table-wrap"><table className="system-table"><thead><tr><th>Name</th><th>Type</th><th>Country</th><th>Provider</th><th>Secret</th><th>Priority</th><th>Status</th></tr></thead>
      <tbody>{list.map(m=><tr key={m.id}><td><strong>{m.name}</strong></td><td>{m.method_type}</td><td>{m.country_code}</td><td>{m.provider_code ?? "—"}</td><td>{m.secret_env_key ? `•••• (${m.secret_env_key})` : "Device pairing"}</td><td>{m.priority}</td><td>{m.is_enabled ? "Enabled" : "Disabled"}</td></tr>)}</tbody></table></div>
    </section>

    <section className="system-panel">
      <div className="system-panel-title"><div><p className="eyebrow">Add provider</p><h2>New delivery method</h2></div></div>
      <form action={saveSmsMethodAction} className="sms-config-grid">
        <label>Name<input name="name" placeholder="CAST Philippines" required/></label>
        <label>Method<select name="method_type" defaultValue="cloud_provider"><option value="cloud_provider">Cloud provider</option><option value="system_android">System Owner Android</option><option value="branch_android">Branch Android</option></select></label>
        <label>Provider code<input name="provider_code" placeholder="cast"/></label>
        <label>Country<input name="country_code" defaultValue="PH" maxLength={2}/></label>
        <label>API base URL<input name="api_base_url" placeholder="https://provider.example/api"/></label>
        <label>Secret environment key<input name="secret_env_key" placeholder="CAST_API_KEY"/></label>
        <label>Sender name<input name="sender_name" placeholder="QueueDrop"/></label>
        <label>Cost / SMS<input name="cost_per_sms" type="number" step="0.0001" min="0"/></label>
        <label>Currency<input name="currency" defaultValue="PHP" maxLength={3}/></label>
        <label>Priority<input name="priority" type="number" min="1" defaultValue="100"/></label>
        <label className="sms-check"><input name="is_enabled" type="checkbox" defaultChecked/>Enabled</label>
        <button className="button button-primary" type="submit">Add delivery method</button>
      </form>
    </section>

    <section className="system-panel">
      <div className="system-panel-title"><div><p className="eyebrow">Android gateways</p><h2>Paired devices</h2></div><span>{devices?.length ?? 0} devices</span></div>
      {devices?.length ? <div className="system-table-wrap"><table className="system-table"><thead><tr><th>Device</th><th>Scope</th><th>Carrier</th><th>Status</th><th>Last seen</th></tr></thead><tbody>
        {devices.map(d=><tr key={d.id}><td><strong>{d.name}</strong><small>{d.phone_number ?? "No SIM number"}</small></td><td>{d.owner_scope}</td><td>{d.carrier ?? "—"}</td><td>{d.status}</td><td>{d.last_seen_at ? new Date(d.last_seen_at).toLocaleString("en-PH") : "Never"}</td></tr>)}
      </tbody></table></div> : <p className="muted">No Android gateway paired yet. The database/device-health foundation is ready; pairing requires the QueueDrop Android Gateway companion app.</p>}
    </section>
  </section>;
}
