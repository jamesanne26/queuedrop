-- Queue actions go through the permission-aware qd_* RPCs used by the app.
-- Direct table writes and legacy RPCs otherwise bypass per-action permissions.
revoke insert,update,delete on public.tickets,public.ticket_events,public.queue_sessions,
  public.service_queue_counters,public.customers,public.customer_sessions from public,anon,authenticated;
grant select,insert,update,delete on public.tickets,public.ticket_events,public.queue_sessions,
  public.service_queue_counters,public.customers,public.customer_sessions to service_role;
revoke execute on function public.staff_call_next(uuid,uuid),public.staff_update_ticket_status(uuid,text),
  public.staff_return_last_to_queue(uuid,uuid),public.staff_return_ticket_to_last(uuid) from public,anon,authenticated;
-- SECURITY DEFINER wrappers still call these as their privileged owner.
notify pgrst, 'reload schema';
