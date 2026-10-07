export const MAX_TV_SERVICES = 6;
export const DEFAULT_TV_SERVICES = 4;
export type TvService = { id: string; name: string; is_active: boolean };
export type TvSettings = { service_count: number; service_ids: string[] };
export function validateTvSettings(count: number, ids: string[]): string | null {
  if (!Number.isInteger(count) || count < 1 || count > MAX_TV_SERVICES) return "Choose between 1 and 6 services per screen.";
  if (ids.length > count) return "Selected services must fit the services-per-screen limit.";
  if (new Set(ids).size !== ids.length || ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) return "Choose valid, unique services.";
  return null;
}
export function displayedTvServices(services: TvService[], settings: TvSettings | null): TvService[] {
  const count = settings?.service_count ?? DEFAULT_TV_SERVICES;
  const active = services.filter(service => service.is_active);
  if (!settings?.service_ids.length) return active.slice(0, count);
  const byId = new Map(active.map(service => [service.id, service]));
  return settings.service_ids.flatMap(id => { const service = byId.get(id); return service ? [service] : []; }).slice(0, count);
}
export type TvTicket = {
  id: string; branch_id: string; service_id: string; queue_session_id: string; display_number: string;
  status: string; joined_at: string; called_at: string | null; serving_at: string | null;
};
export function visibleTvTicket(ticket: TvTicket, branchId: string, sessionIds: string[], serviceIds: string[]) {
  return ticket.branch_id === branchId && sessionIds.includes(ticket.queue_session_id)
    && serviceIds.includes(ticket.service_id) && ["waiting", "called", "serving"].includes(ticket.status);
}
