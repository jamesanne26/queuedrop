-- Forward-only Production hardening: these operational tables are accessed by trusted
-- server paths. Client roles must not receive direct table privileges.
begin;

revoke all privileges on table
  public.sms_delivery_attempts,
  public.sms_delivery_methods,
  public.sms_gateway_devices,
  public.sms_routing_rules
from public, anon, authenticated;

grant all privileges on table
  public.sms_delivery_attempts,
  public.sms_delivery_methods,
  public.sms_gateway_devices,
  public.sms_routing_rules
to service_role;

commit;

notify pgrst, 'reload schema';
