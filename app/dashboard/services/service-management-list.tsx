"use client";

import { useEffect, useMemo, useState } from "react";
import { updateService, setServiceActive } from "./actions";

type Service = {
  id: string;
  branch_id: string;
  name: string;
  description: string | null;
  queue_prefix: string | null;
  estimated_minutes: number | null;
  is_active: boolean;
};

type Branch = {
  id: string;
  name: string;
};

type Props = {
  services: Service[];
  branches: Branch[];
  canManage: boolean;
};

type Modal = null | { kind: "edit"; service: Service };

export function ServiceManagementList({
  services,
  branches,
  canManage,
}: Props) {
  const [modal, setModal] = useState<Modal>(null);
  const branchById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch])),
    [branches],
  );

  useEffect(() => {
    document.body.dataset.qdModalOpen = modal ? "true" : "false";
    return () => {
      delete document.body.dataset.qdModalOpen;
    };
  }, [modal]);

  return (
    <>
      {services.length ? (
        <div className="service-list">
          {services.map((service) => {
            const branch = branchById.get(service.branch_id);

            return (
              <article className="service-row" key={service.id}>
                <div className="service-main">
                  <div className="service-title-row">
                    <strong>{service.name}</strong>
                    <span
                      className={
                        service.is_active
                          ? "status-chip"
                          : "status-chip status-chip-off"
                      }
                    >
                      {service.is_active ? "active" : "inactive"}
                    </span>
                  </div>

                  <span>
                    {branch?.name ?? "Unknown branch"} - Prefix{" "}
                    {service.queue_prefix || "branch default"} ·{" "}
                    {service.estimated_minutes
                      ? `${service.estimated_minutes} min`
                      : "No ETA set"}
                  </span>

                  {service.description ? <p>{service.description}</p> : null}
                </div>

                {canManage ? (
                  <div className="service-action-row">
                    <button
                      className="button button-secondary button-small"
                      type="button"
                      onClick={() => setModal({ kind: "edit", service })}
                    >
                      Edit
                    </button>

                    <form action={setServiceActive}>
                      <input
                        type="hidden"
                        name="service_id"
                        value={service.id}
                      />
                      <input
                        type="hidden"
                        name="branch_id"
                        value={service.branch_id}
                      />
                      <input
                        type="hidden"
                        name="next_active"
                        value={service.is_active ? "false" : "true"}
                      />
                      <button
                        className="button button-secondary button-small"
                        type="submit"
                      >
                        {service.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mini-empty">
          <strong>No services in this view.</strong>
          <span>
            Select another branch tab or create a service for this branch.
          </span>
        </div>
      )}

      {modal?.kind === "edit" ? (
        <div className="qd-modal-backdrop" role="presentation">
          <section
            className="qd-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-service-title"
          >
            <div className="qd-modal-header">
              <div>
                <p className="eyebrow">Service management</p>
                <h2 id="edit-service-title">Edit service</h2>
              </div>
            </div>

            <form action={updateService} className="form-stack">
              <input
                type="hidden"
                name="service_id"
                value={modal.service.id}
              />
              <input
                type="hidden"
                name="branch_id"
                value={modal.service.branch_id}
              />

              <label>
                Service name
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={120}
                  defaultValue={modal.service.name}
                />
              </label>

              <label>
                Description <em>optional</em>
                <textarea
                  name="description"
                  maxLength={500}
                  defaultValue={modal.service.description ?? ""}
                />
              </label>

              <div className="form-split">
                <label>
                  Queue prefix <em>optional</em>
                  <input
                    name="queue_prefix"
                    maxLength={6}
                    defaultValue={modal.service.queue_prefix ?? ""}
                  />
                </label>

                <label>
                  Estimated minutes <em>optional</em>
                  <input
                    name="estimated_minutes"
                    type="number"
                    min={1}
                    max={480}
                    step={1}
                    defaultValue={modal.service.estimated_minutes ?? ""}
                  />
                </label>
              </div>

              <div className="qd-modal-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button className="button button-primary" type="submit">
                  Save service
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
