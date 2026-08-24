"use client";

import { useEffect, useMemo, useState } from "react";
import { createService, setServiceActive, updateService } from "./actions";

type Service = {
  id: string;
  branch_id: string;
  name: string;
  description: string | null;
  queue_prefix: string | null;
  estimated_minutes: number | null;
  is_active: boolean;
};

type Branch = { id: string; name: string; status: string; address: string | null };
type Props = { branches: Branch[]; services: Service[]; canManage: boolean; initialBranchId: string };
type Modal = null | { kind: "edit"; service: Service };

export function ServicesWorkspace({ branches, services, canManage, initialBranchId }: Props) {
  const [selectedBranchId, setSelectedBranchId] = useState(initialBranchId);
  const [modal, setModal] = useState<Modal>(null);
  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const countByBranch = useMemo(() => {
    const counts = new Map<string, number>();
    for (const service of services) counts.set(service.branch_id, (counts.get(service.branch_id) ?? 0) + 1);
    return counts;
  }, [services]);
  const visibleServices = useMemo(
    () => selectedBranchId === "all" ? services : services.filter((s) => s.branch_id === selectedBranchId),
    [selectedBranchId, services],
  );

  useEffect(() => {
    document.body.dataset.qdModalOpen = modal ? "true" : "false";
    return () => { delete document.body.dataset.qdModalOpen; };
  }, [modal]);

  function selectBranch(branchId: string) {
    setSelectedBranchId(branchId);
    const url = new URL(window.location.href);
    url.searchParams.set("branch", branchId);
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
  }

  const selectedBranch = selectedBranchId === "all" ? null : branchById.get(selectedBranchId);

  return (
    <>
      <section className="dashboard-section service-tabs-card">
        <div className="services-branch-picker-mobile">
          <label className="responsive-branch-select">
            <span>Branch</span>
            <select value={selectedBranchId} onChange={(e) => selectBranch(e.target.value)} aria-label="Select branch">
              <option value="all">View all services</option>
              {branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name} — {countByBranch.get(branch.id) ?? 0} services</option>)}
            </select>
          </label>
        </div>
        <div className="service-branch-tabs service-branch-tabs-desktop">
          <button type="button" onClick={() => selectBranch("all")} className={selectedBranchId === "all" ? "service-branch-tab service-branch-tab-active" : "service-branch-tab"}>
            <strong>View all services</strong><span>{services.length} total</span>
          </button>
          {branches.map((branch) => (
            <button key={branch.id} type="button" onClick={() => selectBranch(branch.id)} className={selectedBranchId === branch.id ? "service-branch-tab service-branch-tab-active" : "service-branch-tab"}>
              <strong>{branch.name}</strong><span>{countByBranch.get(branch.id) ?? 0} services</span>
            </button>
          ))}
        </div>
      </section>

      <div className="management-grid services-management-grid">
        <section className="dashboard-section dashboard-section-stack management-list-card">
          <div className="section-row"><div><p className="eyebrow">Configured services</p><h2>{visibleServices.length} service{visibleServices.length === 1 ? "" : "s"}</h2></div>{selectedBranch ? <span className="muted">{selectedBranch.name}</span> : null}</div>
          {visibleServices.length ? <div className="service-list">
            {visibleServices.map((service) => {
              const branch = branchById.get(service.branch_id);
              return <article className="service-row" key={service.id}>
                <div className="service-main">
                  <div className="service-title-row"><strong>{service.name}</strong><span className={service.is_active ? "status-chip" : "status-chip status-chip-off"}>{service.is_active ? "active" : "inactive"}</span></div>
                  <span>{branch?.name ?? "Unknown branch"} · Prefix {service.queue_prefix || "branch default"} · {service.estimated_minutes ? `${service.estimated_minutes} min` : "No ETA set"}</span>
                  {service.description ? <p>{service.description}</p> : null}
                </div>
                {canManage ? <div className="service-action-row">
                  <button className="button button-secondary button-small" type="button" onClick={() => setModal({ kind: "edit", service })}>Edit</button>
                  <form action={setServiceActive}><input type="hidden" name="service_id" value={service.id}/><input type="hidden" name="branch_id" value={service.branch_id}/><input type="hidden" name="next_active" value={service.is_active ? "false" : "true"}/><button className="button button-secondary button-small" type="submit">{service.is_active ? "Deactivate" : "Activate"}</button></form>
                </div> : null}
              </article>;
            })}
          </div> : <div className="mini-empty"><strong>No services in this view.</strong><span>Select another branch or create a service for this branch.</span></div>}
        </section>

        {canManage ? <section className="dashboard-section dashboard-section-stack management-form-card service-create-card">
          <div><p className="eyebrow">Add queue category</p><h2>Create service</h2></div>
          <form action={createService} className="form-stack management-form">
            {selectedBranchId !== "all" ? <input type="hidden" name="branch_id" value={selectedBranchId}/> : <div className="mini-empty"><strong>Select a branch first.</strong><span>Choose a branch above before creating a service.</span></div>}
            <label>Service name<input name="name" required minLength={2} maxLength={120} placeholder="e.g. Haircut"/></label>
            <label>Description <em>optional</em><textarea name="description" maxLength={500} placeholder="What this queue is for"/></label>
            <div className="form-split"><label>Queue prefix <em>optional</em><input name="queue_prefix" maxLength={6} placeholder="HC"/></label><label>Estimated minutes <em>optional</em><input name="estimated_minutes" type="number" min={1} max={480} step={1} placeholder="30"/></label></div>
            <button className="button button-primary" type="submit" disabled={!branches.length || selectedBranchId === "all"}>Create service</button>
          </form>
        </section> : null}
      </div>

      {modal?.kind === "edit" ? <div className="qd-modal-backdrop" role="presentation"><section className="qd-modal" role="dialog" aria-modal="true" aria-labelledby="edit-service-title">
        <div className="qd-modal-header"><div><p className="eyebrow">Service management</p><h2 id="edit-service-title">Edit service</h2></div></div>
        <form action={updateService} className="form-stack">
          <input type="hidden" name="service_id" value={modal.service.id}/><input type="hidden" name="branch_id" value={modal.service.branch_id}/>
          <label>Service name<input name="name" required minLength={2} maxLength={120} defaultValue={modal.service.name}/></label>
          <label>Description <em>optional</em><textarea name="description" maxLength={500} defaultValue={modal.service.description ?? ""}/></label>
          <div className="form-split"><label>Queue prefix <em>optional</em><input name="queue_prefix" maxLength={6} defaultValue={modal.service.queue_prefix ?? ""}/></label><label>Estimated minutes <em>optional</em><input name="estimated_minutes" type="number" min={1} max={480} step={1} defaultValue={modal.service.estimated_minutes ?? ""}/></label></div>
          <div className="qd-modal-actions"><button className="button button-secondary" type="button" onClick={() => setModal(null)}>Cancel</button><button className="button button-primary" type="submit">Save service</button></div>
        </form>
      </section></div> : null}
    </>
  );
}
