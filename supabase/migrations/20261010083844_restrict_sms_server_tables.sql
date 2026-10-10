-- SMS operational/configuration tables are accessed through trusted server paths.
-- Direct client grants bypass RLS because no row policies exist.
revoke all on table public.sms_delivery_attempts, public.sms_delivery_methods,
  public.sms_gateway_devices, public.sms_routing_rules
  from public, anon, authenticated;
grant all on table public.sms_delivery_attempts, public.sms_delivery_methods,
  public.sms_gateway_devices, public.sms_routing_rules
  to service_role;
notify pgrst, 'reload schema';
