"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createService, deleteService, setServiceActive, updateService } from "./actions";

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
type Props = { branches: Branch[]; services: Service[]; canManage: boolean; initialBranchId: string; lockBranch?: boolean };
type Modal = null | { kind: "edit"; service: Service } | { kind: "delete"; service: Service };
type ActiveConfirm = { service: Service; nextActive: boolean };

export function ServicesWorkspace({ branches, services, canManage, initialBranchId, lockBranch = false }: Props) {
  const [selectedBranchId, setSelectedBranchId] = useState(initialBranchId);
  const [modal, setModal] = useState<Modal>(null);
  const [activeConfirm, setActiveConfirm] = useState<ActiveConfirm | null>(null);
  const pendingActiveFormRef = useRef<HTMLFormElement | null>(null);
  const allowActiveSubmitRef = useRef(false);

  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const countByBranch = useMemo(() => {
    const counts = new Map<string, number>();
    for (const service of services) counts.set(service.branch_id, (counts.get(service.branch_id) ?? 0) + 1);
    return counts;
  }, [services]);
  const visibleServices = useMemo(
    () => selectedBranchId ? services.filter((s) => s.branch_id === selectedBranchId) : [],
    [selectedBranchId, services],
  );

  useEffect(() => {
    const modalOpen = Boolean(modal || activeConfirm);
    document.body.dataset.qdModalOpen = modalOpen ? "true" : "false";
    return () => { delete document.body.dataset.qdModalOpen; };
  }, [modal, activeConfirm]);

  useEffect(() => {
    const handleResultModalOpen = () => {
      setModal(null);
      setActiveConfirm(null);
      pendingActiveFormRef.current = null;
      allowActiveSubmitRef.current = false;
    };

    window.addEventListener("qd:result-modal-open", handleResultModalOpen);
    return () => window.removeEventListener("qd:result-modal-open", handleResultModalOpen);
  }, []);

  function selectBranch(branchId: string) {
    setSelectedBranchId(branchId);
    const url = new URL(window.location.href);
    if (!branchId) url.searchParams.delete("branch");
    else url.searchParams.set("branch", branchId);
    window.history.replaceState(null, "", `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ""}`);
  }

  function requestActiveChange(event: FormEvent<HTMLFormElement>, service: Service) {
    if (allowActiveSubmitRef.current) {
      allowActiveSubmitRef.current = false;
      return;
    }
    event.preventDefault();
    pendingActiveFormRef.current = event.currentTarget;
    setActiveConfirm({ service, nextActive: !service.is_active });
  }

  function cancelActiveChange() {
    pendingActiveFormRef.current = null;
    allowActiveSubmitRef.current = false;
    setActiveConfirm(null);
  }

  function confirmActiveChange() {
    const form = pendingActiveFormRef.current;
    setActiveConfirm(null);
    pendingActiveFormRef.current = null;
    if (!form) return;
    document.body.dataset.qdModalOpen = "false";
    allowActiveSubmitRef.current = true;
    form.requestSubmit();
  }

  const selectedBranch = selectedBranchId ? branchById.get(selectedBranchId) : null;

  return (
    <>
      {!lockBranch ? <section className="dashboard-section service-tabs-card">
        <div className="services-branch-picker-mobile">
          <label className="responsive-branch-select">
            <span>Branch</span>
            <select value={selectedBranchId} onChange={(e) => selectBranch(e.target.value)} aria-label="Select branch">
              <option value="" disabled>Select branch</option>
              {branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name} - {countByBranch.get(branch.id) ?? 0} services</option>)}
            </select>
          </label>
        </div>
        <div className="service-branch-tabs service-branch-tabs-desktop">
          {branches.map((branch) => (
            <button key={branch.id} type="button" onClick={() => selectBranch(branch.id)} className={selectedBranchId === branch.id ? "service-branch-tab service-branch-tab-active" : "service-branch-tab"}>
              <strong>{branch.name}</strong><span>{countByBranch.get(branch.id) ?? 0} services</span>
            </button>
          ))}
        </div>
      </section> : null}

      <div className="management-grid services-management-grid">
        <section className="dashboard-section dashboard-section-stack management-list-card">
          <div className="section-row"><div><p className="eyebrow">Configured services</p><h2>{visibleServices.length} service{visibleServices.length === 1 ? "" : "s"}</h2></div>{selectedBranch ? <span className="muted">{selectedBranch.name}</span> : null}</div>
          {!selectedBranchId ? <div className="mini-empty services-select-first"><strong>Select a branch first.</strong><span>Choose a branch above to view and manage its services.</span></div> : visibleServices.length ? <div className="service-list">
            {visibleServices.map((service) => {
              const branch = branchById.get(service.branch_id);
              return <article className="service-row" key={service.id}>
                <div className="service-main">
                  <div className="service-title-row"><strong>{service.name}</strong><span className={service.is_active ? "status-chip" : "status-chip status-chip-off"}>{service.is_active ? "active" : "inactive"}</span></div>
                  <span>{branch?.name ?? "Unknown branch"} - Prefix {service.queue_prefix || "branch default"} - {service.estimated_minutes ? `${service.estimated_minutes} min` : "No ETA set"}</span>
                  {service.description ? <p>{service.description}</p> : null}
                </div>
                {canManage ? <div className="service-action-row">
                  <button className="button button-secondary button-small" type="button" onClick={() => setModal({ kind: "edit", service })}>Edit</button>
                  <button className="button button-danger-outline button-small" type="button" onClick={() => setModal({ kind: "delete", service })}>Delete</button>
                  <form action={setServiceActive} onSubmit={(event) => requestActiveChange(event, service)}>
                    <input type="hidden" name="service_id" value={service.id}/><input type="hidden" name="branch_id" value={service.branch_id}/><input type="hidden" name="next_active" value={service.is_active ? "false" : "true"}/>
                    <button className="button button-secondary button-small" type="submit">{service.is_active ? "Deactivate" : "Activate"}</button>
                  </form>
                </div> : null}
              </article>;
            })}
          </div> : <div className="mini-empty"><strong>No services in this branch.</strong><span>Create the first service for this branch.</span></div>}
        </section>

        {canManage ? <section className="dashboard-section dashboard-section-stack management-form-card service-create-card">
          <div><p className="eyebrow">Add queue category</p><h2>Create service</h2></div>
          {selectedBranchId ? (
            <form action={createService} className="form-stack management-form">
              <input type="hidden" name="branch_id" value={selectedBranchId}/>
              <label>Service name<input name="name" required minLength={2} maxLength={120} placeholder="e.g. Haircut"/></label>
              <label>Description <em>optional</em><textarea name="description" maxLength={500} placeholder="What this queue is for"/></label>
              <div className="form-split"><label>Queue prefix <em>optional</em><input name="queue_prefix" maxLength={6} placeholder="HC"/></label><label>Estimated minutes <em>optional</em><input name="estimated_minutes" type="number" min={1} max={480} step={1} placeholder="30"/></label></div>
              <button className="button button-primary" type="submit">Create service</button>
            </form>
          ) : (
            <div className="mini-empty services-select-first"><strong>Select a branch first.</strong><span>Choose a branch above before the service form becomes available.</span></div>
          )}
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

      {modal?.kind === "delete" ? <div className="qd-modal-backdrop" role="presentation"><section className="qd-modal qd-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-service-title">
        <div className="qd-confirm-icon qd-confirm-icon-danger" aria-hidden="true">!</div>
        <div className="qd-confirm-copy">
          <h2 id="delete-service-title">Delete service?</h2>
          <p>Are you sure you want to delete <strong>{modal.service.name}</strong>? Services with queue history are protected and cannot be deleted.</p>
        </div>
        <form action={deleteService} className="qd-modal-actions">
          <input type="hidden" name="service_id" value={modal.service.id} />
          <input type="hidden" name="branch_id" value={modal.service.branch_id} />
          <button className="button button-secondary" type="button" onClick={() => setModal(null)}>Cancel</button>
          <button className="button button-danger" type="submit">Delete service</button>
        </form>
      </section></div> : null}

      {activeConfirm ? <div className="qd-modal-backdrop" role="presentation"><section className="qd-modal qd-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="service-active-confirm-title">
        <div className={activeConfirm.nextActive ? "qd-confirm-icon" : "qd-confirm-icon qd-confirm-icon-danger"} aria-hidden="true">{activeConfirm.nextActive ? "✓" : "!"}</div>
        <div className="qd-confirm-copy">
          <h2 id="service-active-confirm-title">{activeConfirm.nextActive ? "Activate service?" : "Deactivate service?"}</h2>
          <p>Are you sure you want to {activeConfirm.nextActive ? "activate" : "deactivate"} <strong>{activeConfirm.service.name}</strong>?</p>
        </div>
        <div className="qd-modal-actions">
          <button className="button button-secondary" type="button" onClick={cancelActiveChange}>Cancel</button>
          <button className={activeConfirm.nextActive ? "button button-primary" : "button button-danger"} type="button" onClick={confirmActiveChange}>{activeConfirm.nextActive ? "Activate" : "Deactivate"}</button>
        </div>
      </section></div> : null}
    </>
  );
}
