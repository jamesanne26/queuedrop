"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createTerminal, type CreateTerminalState } from "./actions";

type Service = { id: string; name: string; is_active: boolean };
type Branch = { id: string; name: string; services: Service[] | null };

export function CreateTerminalForm({ branches, defaultBranchId = "", hideBranchSelect = false, submitLabel = "Create terminal" }: { branches: Branch[]; defaultBranchId?: string; hideBranchSelect?: boolean; submitLabel?: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [branchId, setBranchId] = useState(defaultBranchId);
  const initialState: CreateTerminalState = { status: "idle" };
  const [state, formAction, pending] = useActionState(createTerminal, initialState);
  const services = useMemo(() => (branches.find((branch) => branch.id === branchId)?.services ?? []).filter((service) => service.is_active), [branches, branchId]);
  useEffect(() => { if (state.status === "success") { formRef.current?.reset(); router.refresh(); } }, [router, state]);
  return <>
    {state.status === "error" ? <div className="notice notice-error" role="alert">{state.message}</div> : null}
    {state.status === "success" ? <div className="terminal-pin-reveal" role="status"><div><strong>{state.terminalName} created</strong><span>Terminal PIN — save it now. This is shown only once.</span></div><code>{state.pin}</code></div> : null}
    <form ref={formRef} action={formAction} className="form-stack compact-form">
      <label>Terminal name<input name="name" required maxLength={80} placeholder="Front Desk Terminal" /></label>
      {hideBranchSelect ? <input type="hidden" name="branch_id" value={branchId} /> : <label>Branch<select name="branch_id" required value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="" disabled>Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
      <label>Default service<select name="service_id" required key={branchId} defaultValue=""><option value="" disabled>Select default service</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select><small className="muted">This is preselected when Get Stub opens. Customers can still choose any active service in this branch.</small></label>
      <div className="terminal-create-pin-fields"><label>Terminal PIN<input name="kiosk_exit_pin" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,8}" minLength={4} maxLength={8} required placeholder="4–8 digit PIN" /></label><label>Confirm PIN<input name="kiosk_exit_pin_confirm" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,8}" minLength={4} maxLength={8} required placeholder="Repeat PIN" /></label></div>
      <button className="button button-primary" type="submit" disabled={pending || !branches.length}>{pending ? "Creating…" : submitLabel}</button>
    </form>
  </>;
}
