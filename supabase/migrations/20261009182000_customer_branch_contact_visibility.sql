-- Respect each branch's customer-facing contact preference on stub status pages.
set local check_function_bodies = off;

create or replace function public.get_stub_ticket_status(target_session_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket public.tickets%rowtype;
  v_business_name text;
  v_branch_name text;
  v_branch_phone text;
  v_service_name text;
  v_refresh integer;
  v_position integer;
  v_queue jsonb;
begin
  select t.* into v_ticket
  from public.customer_sessions cs
  join public.tickets t on t.customer_session_id = cs.id
  where cs.session_token = target_session_token
    and cs.expires_at > now()
  order by t.created_at desc
  limit 1;

  if v_ticket.id is null then return null; end if;

  select b.name,
    bus.name,
    case when coalesce(qc.show_branch_contact, false) then nullif(btrim(b.phone), '') else null end,
    s.name,
    coalesce(qc.customer_refresh_seconds, 8)
  into v_branch_name, v_business_name, v_branch_phone, v_service_name, v_refresh
  from public.branches b
  join public.businesses bus on bus.id = b.business_id
  join public.services s on s.id = v_ticket.service_id
  left join public.queue_configurations qc on qc.branch_id = b.id
  where b.id = v_ticket.branch_id;

  if v_ticket.status = 'waiting' then
    select count(*)::integer into v_position
    from public.tickets t
    where t.queue_session_id = v_ticket.queue_session_id
      and t.service_id = v_ticket.service_id
      and t.status = 'waiting'
      and t.ticket_number <= v_ticket.ticket_number;
  else
    v_position := 0;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object('display_number', x.display_number, 'position', x.pos, 'is_you', x.id = v_ticket.id)
    order by x.pos
  ), '[]'::jsonb)
  into v_queue
  from (
    select t.id, t.display_number,
      row_number() over (order by t.ticket_number, t.joined_at, t.id)::integer pos
    from public.tickets t
    where t.queue_session_id = v_ticket.queue_session_id
      and t.service_id = v_ticket.service_id
      and t.status = 'waiting'
  ) x;

  return jsonb_build_object(
    'ticket_id', v_ticket.id,
    'display_number', v_ticket.display_number,
    'status', v_ticket.status,
    'position', coalesce(v_position, 0),
    'sms_phone', v_ticket.sms_phone,
    'branch_phone', v_branch_phone,
    'customer_refresh_seconds', v_refresh,
    'business_name', v_business_name,
    'branch_name', v_branch_name,
    'service_name', v_service_name,
    'queue_list', v_queue,
    'source', v_ticket.source
  );
end;
$$;

revoke all on function public.get_stub_ticket_status(uuid) from public;
grant execute on function public.get_stub_ticket_status(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
