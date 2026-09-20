"use client";

import { createCatalogService, deleteCatalogService, updateCatalogService, assignCatalogServiceToBranch } from "./actions";
import { ConfirmDeleteSubmit } from "@/app/dashboard/_components/confirm-delete-submit";

type Branch = { id: string; name: string };
type CatalogService = {
  key: string;
  name: string;
  group: string | null;
  description: string | null;
  queue_prefix: string | null;
  estimated_minutes: number | null;
  branch_ids: string[];
};

type Props = { branches: Branch[]; services: CatalogService[]; canManage: boolean };

export function ServiceCatalog({ services, canManage }: Props) {
  return (
    <section className="settings-service-catalog">
      <div className="settings-catalog-header">
        <div>
          <h2>Services</h2>
          <p className="muted">Build a business-wide service library first. Assign services to branches separately.</p>
        </div>
        <span className="status-chip">{services.length} service{services.length === 1 ? "" : "s"}</span>
      </div>

      {canManage ? (
        <details className="settings-catalog-create">
          <summary>＋ Add service</summary>
          <form action={createCatalogService} className="settings-catalog-form">
            <label>Service name<input name="name" required minLength={2} maxLength={120} placeholder="e.g. Haircut" /></label>
            <label>Group<input name="service_group" maxLength={80} placeholder="e.g. Salon, Auto" /></label>
            <label>Description<textarea name="description" maxLength={500} placeholder="Optional description" /></label>
            <div className="settings-catalog-split">
              <label>Queue prefix<input name="queue_prefix" maxLength={6} placeholder="HC" /></label>
              <label>Estimated minutes<input name="estimated_minutes" type="number" min={1} max={480} placeholder="30" /></label>
            </div>
            <button className="button button-primary" type="submit">Create service</button>
          </form>
        </details>
      ) : null}

      <div className="settings-catalog-list">
        {services.map((service) => (
          <article className="settings-catalog-row" key={service.key}>
            <div className="settings-catalog-row-main">
              <div><strong>{service.name}</strong><span>{service.group ? `${service.group} · ` : ""}{service.queue_prefix ? `Prefix ${service.queue_prefix}` : "No prefix"}{service.estimated_minutes ? ` · ${service.estimated_minutes} min` : ""}</span></div>
              <small>{service.branch_ids.length ? `${service.branch_ids.length} branch${service.branch_ids.length === 1 ? "" : "es"}` : "Not visible in any branch"}</small>
            </div>
            {canManage ? (
              <details className="settings-catalog-edit">
                <summary>Edit</summary>
                <form action={updateCatalogService} className="settings-catalog-form">
                  <input type="hidden" name="service_key" value={service.key} />
                  <label>Service name<input name="name" required minLength={2} maxLength={120} defaultValue={service.name} /></label>
                  <label>Group<input name="service_group" maxLength={80} placeholder="e.g. Salon, Auto" defaultValue={service.group ?? ""} /></label>
                  <label>Description<textarea name="description" maxLength={500} defaultValue={service.description ?? ""} /></label>
                  <div className="settings-catalog-split">
                    <label>Queue prefix<input name="queue_prefix" maxLength={6} defaultValue={service.queue_prefix ?? ""} /></label>
                    <label>Estimated minutes<input name="estimated_minutes" type="number" min={1} max={480} defaultValue={service.estimated_minutes ?? ""} /></label>
                  </div>
                  <div className="settings-catalog-actions"><button className="button button-primary" type="submit">Save service</button></div>
                </form>
                <form action={deleteCatalogService} className="settings-catalog-delete-form">
                  <input type="hidden" name="service_key" value={service.key} />
                  
                  <ConfirmDeleteSubmit className="button button-danger-outline" message={`Delete ${service.name}? This removes the service from every branch where it is configured.`} requireCode title="Delete service">Delete service</ConfirmDeleteSubmit>
                  <small>Deletion is blocked when the service already has queue history.</small>
                </form>
              </details>
            ) : null}
          </article>
        ))}
        {!services.length ? <div className="mini-empty"><strong>No services yet.</strong><span>Add services to your library first. You can assign them to branches later.</span></div> : null}
      </div>
    </section>
  );
}

type BranchAssignmentProps = {
  branchId: string;
  branchName: string;
  catalog: CatalogService[];
  assignedNames: string[];
  canManage: boolean;
};

export function BranchServiceAssignments({ branchId, branchName, catalog, assignedNames, canManage }: BranchAssignmentProps) {
  const assignedSet = new Set(assignedNames);
  const assigned = catalog.filter((service) => assignedSet.has(service.key));
  const available = catalog.filter((service) => !assignedSet.has(service.key));

  return (
    <section className="settings-branch-service-assignments">
      <div className="settings-catalog-header">
        <div><p className="eyebrow">Branch · Services</p><h2>{branchName} services</h2><p className="muted">Choose services from the business-wide service library. This screen is scoped only to {branchName}.</p></div>
      </div>
      {canManage && available.length ? (
        <form action={assignCatalogServiceToBranch} className="settings-service-picker">
          <input type="hidden" name="branch_id" value={branchId} />
          <input type="hidden" name="mode" value="assign" />
          <label>Select service<select name="service_key" required defaultValue=""><option value="" disabled>Choose a service</option>{available.map((service) => <option value={service.key} key={service.key}>{service.name}</option>)}</select></label>
          <button className="button button-primary" type="submit">Add to branch</button>
        </form>
      ) : null}
      <div className="settings-assigned-service-list">
        {assigned.map((service) => <article key={service.key}><div><strong>{service.name}</strong><span>{service.queue_prefix ? `Prefix ${service.queue_prefix}` : "No prefix"}{service.estimated_minutes ? ` · ${service.estimated_minutes} min` : ""}</span></div>{canManage ? <form action={assignCatalogServiceToBranch}><input type="hidden" name="branch_id" value={branchId} /><input type="hidden" name="service_key" value={service.key} /><input type="hidden" name="mode" value="remove" /><ConfirmDeleteSubmit className="button button-danger-outline button-small" message={`Remove ${service.name} from ${branchName}?`}>Remove</ConfirmDeleteSubmit></form> : null}</article>)}
        {!assigned.length ? <div className="mini-empty"><strong>No services assigned.</strong><span>Choose one from the service library above.</span></div> : null}
      </div>
    </section>
  );
}
