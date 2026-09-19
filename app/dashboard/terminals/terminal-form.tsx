"use client";

import { useMemo, useState } from "react";

type Service = { id: string; name: string; is_active: boolean };
type Branch = { id: string; name: string; services: Service[] | null };

type Props = {
  branches: Branch[];
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  terminalId?: string;
  defaultName?: string;
  defaultBranchId?: string;
  defaultServiceId?: string;
  compact?: boolean;
  hideBranchSelect?: boolean;
  disabled?: boolean;
};

export function TerminalForm({ branches, action, submitLabel, terminalId, defaultName = "", defaultBranchId = "", defaultServiceId = "", compact = false, hideBranchSelect = false, disabled = false }: Props) {
  const [branchId, setBranchId] = useState(defaultBranchId);
  const services = useMemo(() => {
    const branch = branches.find((item) => item.id === branchId);
    return (branch?.services ?? []).filter((service) => service.is_active);
  }, [branches, branchId]);

  return <form action={action} className={compact ? "form-stack compact-form terminal-edit-form" : "form-stack compact-form"}>
    {terminalId ? <input type="hidden" name="id" value={terminalId} /> : null}
    <label>Terminal name<input name="name" required maxLength={80} defaultValue={defaultName} placeholder="Front Desk Terminal" /></label>
    {hideBranchSelect ? <input type="hidden" name="branch_id" value={branchId} /> : <label>Branch<select name="branch_id" required value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="" disabled>Select branch</option>{branches.map((branch)=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
    <label>Default service<select name="service_id" required defaultValue={branchId === defaultBranchId ? defaultServiceId : ""} key={branchId}><option value="" disabled>Select default service</option>{services.map((service)=><option key={service.id} value={service.id}>{service.name}</option>)}</select><small className="muted">This is preselected when Get Stub opens. Customers can still choose any active service in this branch.</small></label>
    <button className="button button-primary" type="submit" disabled={disabled}>{disabled ? "Set PIN first" : submitLabel}</button>
  </form>;
}
