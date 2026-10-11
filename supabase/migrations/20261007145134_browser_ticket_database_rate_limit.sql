-- Calling PostgREST directly must not bypass the website's issuance rate limit.
do $$ begin
  if to_regprocedure('public.issue_browser_queue_ticket_internal(uuid)') is null then
    alter function public.issue_browser_queue_ticket(uuid) rename to issue_browser_queue_ticket_internal;
  end if;
end $$;
revoke all on function public.issue_browser_queue_ticket_internal(uuid) from public,anon,authenticated,service_role;
create or replace function public.issue_browser_queue_ticket(target_device_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rate jsonb;
begin
  rate:=public.consume_app_rate_limit(md5('browser-ticket:'||target_device_token::text),120,60);
  if not (rate->>'allowed')::boolean then raise exception 'Too many ticket requests. Try again shortly.' using errcode='P0001'; end if;
  return public.issue_browser_queue_ticket_internal(target_device_token);
end;
$$;
revoke all on function public.issue_browser_queue_ticket(uuid) from public;
grant execute on function public.issue_browser_queue_ticket(uuid) to anon,authenticated,service_role;

notify pgrst, 'reload schema';
