"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Service = { id: string; name: string; is_active: boolean };
type Branch = { id: string; name: string; services: Service[] | null };

export function CreateTerminalForm({ branches, defaultBranchId = "", hideBranchSelect = false, submitLabel = "Create terminal" }: { branches: Branch[]; defaultBranchId?: string; hideBranchSelect?: boolean; submitLabel?: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [state, setState] = useState<{ status: "idle" | "error" | "success"; message?: string; terminalName?: string; pin?: string }>({ status: "idle" });
  const [pending, setPending] = useState(false);
  const [, startRefresh] = useTransition();
  const services = useMemo(() => (branches.find((branch) => branch.id === branchId)?.services ?? []).filter((service) => service.is_active), [branches, branchId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    const serviceId = String(formData.get("service_id") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const pin = String(formData.get("kiosk_exit_pin") ?? "").trim();
    const confirmPin = String(formData.get("kiosk_exit_pin_confirm") ?? "").trim();
    if (!branchId || !serviceId || !name) return setState({ status: "error", message: "Branch, default service, and terminal name are required." });
    if (!/^\d{4,8}$/.test(pin)) return setState({ status: "error", message: "Terminal PIN must contain 4 to 8 digits." });
    if (pin !== confirmPin) return setState({ status: "error", message: "Terminal PIN confirmation does not match." });

    setPending(true);
    setState({ status: "idle" });
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("create_stub_terminal", {
        target_branch_id: branchId,
        target_service_id: serviceId,
        target_name: name,
        target_pin: pin,
      });
      if (error) throw new Error(error.message);
      setState({ status: "success", message: "QueueDrop terminal created.", terminalName: name, pin });
      formRef.current?.reset();
      window.dispatchEvent(new Event("qd:submit-complete"));
      startRefresh(() => router.refresh());
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Unable to create terminal." });
      window.dispatchEvent(new Event("qd:submit-complete"));
    } finally {
      setPending(false);
    }
  }
  return <>
    {state.status === "error" ? <div className="notice notice-error" role="alert">{state.message}</div> : null}
    {state.status === "success" ? <div className="terminal-pin-reveal" role="status"><div><strong>{state.terminalName} created</strong><span>Terminal PIN — save it now. This is shown only once.</span></div><code>{state.pin}</code></div> : null}
    <form ref={formRef} onSubmit={submit} data-no-global-loading="true" className="form-stack compact-form">
      <label>Terminal name<input name="name" required maxLength={80} placeholder="Front Desk Terminal" /></label>
      {hideBranchSelect ? <input type="hidden" name="branch_id" value={branchId} /> : <label>Branch<select name="branch_id" required value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="" disabled>Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
      <label>Default service<select name="service_id" required key={branchId} defaultValue=""><option value="" disabled>Select default service</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select><small className="muted">This is preselected when Get Stub opens. Customers can still choose any active service in this branch.</small></label>
      <div className="terminal-create-pin-fields"><label>Terminal PIN<input name="kiosk_exit_pin" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,8}" minLength={4} maxLength={8} required placeholder="4–8 digit PIN" /></label><label>Confirm PIN<input name="kiosk_exit_pin_confirm" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,8}" minLength={4} maxLength={8} required placeholder="Repeat PIN" /></label></div>
      <button className="button button-primary" type="submit" disabled={pending || !branches.length}>{pending ? "Creating…" : submitLabel}</button>
    </form>
  </>;
}
