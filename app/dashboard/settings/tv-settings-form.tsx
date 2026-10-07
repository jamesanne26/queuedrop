"use client";
import { useState } from "react";
import { updateTvSettings } from "./tv-actions";
import { DEFAULT_TV_SERVICES, MAX_TV_SERVICES, type TvService, type TvSettings } from "@/lib/tv/config";
import { PendingSubmitButton } from "@/app/dashboard/_components/pending-submit-button";
export function TvSettingsForm({ branchId, services, settings }: { branchId: string; services: TvService[]; settings: TvSettings | null }) {
  const [count, setCount] = useState(settings?.service_count ?? DEFAULT_TV_SERVICES);
  const [selected, setSelected] = useState(settings?.service_ids ?? []);
  const active = services.filter(service => service.is_active);
  const selectedCount = active.filter(service => selected.includes(service.id)).length;
  return <section className="settings-new-section"><div className="settings-new-heading"><p className="eyebrow">TV Display</p><h2>TV display settings</h2><p className="muted">Choose up to 6 services for this branch. The screen automatically fits the selected services.</p></div>
    <form action={updateTvSettings} className="form-stack tv-settings-form"><input type="hidden" name="branch_id" value={branchId} />
      <label>Services per screen<select name="service_count" value={count} onChange={event => setCount(Number(event.target.value))}>{Array.from({length:MAX_TV_SERVICES},(_,index)=><option key={index+1} value={index+1}>{index+1}</option>)}</select></label>
      <fieldset><legend>Services to display</legend><p className="muted">Leave all unchecked to automatically show the first {count} active services. Select specific services to keep this screen focused.</p>
        {active.map(service => <label key={service.id} className="tv-service-choice"><input type="checkbox" name="service_ids" value={service.id} checked={selected.includes(service.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, service.id] : previous.filter(id => id !== service.id))} />{service.name}</label>)}
        {!active.length ? <p className="muted">Add an active service to this branch first.</p> : null}
      </fieldset>
      {selectedCount > count ? <p role="alert" className="notice notice-error">Select no more than {count} services, or increase services per screen.</p> : null}
      <PendingSubmitButton className="button button-primary" idle="Save TV settings" pending="Saving…" disabled={selectedCount > count} />
    </form></section>;
}
