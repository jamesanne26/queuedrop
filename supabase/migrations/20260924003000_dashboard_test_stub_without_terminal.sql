-- Dashboard test stubs are queue simulations, not physical ticket terminals.
-- Issue them directly so they do not consume a paid terminal slot or create a
-- print job that no PrintBridge device can claim.
set local check_function_bodies = off;

create or replace function public.dashboard_issue_test_stub(
  target_branch_id uuid,
  target_service_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_business public.businesses%rowtype;
  v_branch public.branches%rowtype;
  v_service public.services%rowtype;
  v_config public.queue_configurations%rowtype;
  v_role public.user_role;
  v_session_date date;
  v_queue_session_id uuid;
  v_queue_status text;
  v_customer_session_id uuid;
  v_session_token uuid;
  v_ticket_number integer;
  v_display_number text;
  v_ticket_id uuid;
  v_position integer;
  v_prefix text;
begin
  if auth.uid() is null then
    raise exception 'Your session expired. Sign in again and retry';
  end if;

  select br, bu.role
    into v_branch, v_role
  from public.branches br
  join public.business_users bu
    on bu.business_id = br.business_id
   and bu.user_id = auth.uid()
   and bu.is_active = true
  where br.id = target_branch_id
  limit 1;

  if v_branch.id is null then
    raise exception 'The selected branch is not available to this business';
  end if;
  if v_role not in ('owner','admin') then
    raise exception 'Get test stub is available only to client administrators';
  end if;

  select * into v_business from public.businesses where id = v_branch.business_id;
  select * into v_service from public.services
  where id = target_service_id and branch_id = v_branch.id and is_active = true;
  if v_service.id is null then
    raise exception 'Selected service is not available for this client';
  end if;

  select * into v_config from public.queue_configurations where branch_id = v_branch.id;
  if v_business.status <> 'active' or v_branch.status <> 'active' then
    raise exception 'This queue is not available';
  end if;
  if not coalesce(v_config.is_active,false) or not coalesce(v_config.stub_mode_enabled,false) then
    raise exception 'Stub issuing is currently disabled';
  end if;
  if not public.is_branch_open_now(v_branch.id) then
    raise exception 'The branch is currently closed';
  end if;

  begin
    v_session_date := (timezone(v_branch.timezone,now()))::date;
  exception when others then
    raise exception 'Branch timezone configuration is invalid';
  end;

  insert into public.queue_sessions(branch_id,session_date,status,opened_at)
  values(v_branch.id,v_session_date,'open',now())
  on conflict(branch_id,session_date) do nothing;

  select qs.id,qs.status into v_queue_session_id,v_queue_status
  from public.queue_sessions qs
  where qs.branch_id=v_branch.id and qs.session_date=v_session_date
  for update;
  if v_queue_status <> 'open' then raise exception 'The queue is currently closed'; end if;

  insert into public.service_queue_counters(queue_session_id,service_id,current_number)
  values(v_queue_session_id,v_service.id,v_config.starting_number)
  on conflict(queue_session_id,service_id) do update
  set current_number=public.service_queue_counters.current_number+1,updated_at=now()
  returning current_number into v_ticket_number;

  update public.queue_sessions set current_number=current_number+1 where id=v_queue_session_id;
  v_prefix := coalesce(nullif(v_service.queue_prefix,''),nullif(v_config.ticket_prefix,''),'Q');
  v_display_number := v_prefix||lpad(v_ticket_number::text,3,'0');

  insert into public.customer_sessions(customer_id,branch_id,expires_at)
  values(null,v_branch.id,now()+interval '24 hours')
  returning id,session_token into v_customer_session_id,v_session_token;

  insert into public.tickets(
    queue_session_id,branch_id,service_id,customer_id,customer_session_id,
    ticket_number,display_number,status,source,issued_by_device_id
  ) values(
    v_queue_session_id,v_branch.id,v_service.id,null,v_customer_session_id,
    v_ticket_number,v_display_number,'waiting','stub_terminal',null
  ) returning id into v_ticket_id;

  insert into public.ticket_events(ticket_id,event_type,performed_by,notes)
  values(v_ticket_id,'waiting',auth.uid(),'Dashboard test stub issued for service '||v_service.name);

  select count(*)::integer into v_position from public.tickets t
  where t.queue_session_id=v_queue_session_id
    and t.service_id=v_service.id
    and t.status='waiting'
    and t.ticket_number<=v_ticket_number;

  return jsonb_build_object(
    'ticket_id',v_ticket_id,
    'print_job_id',null,
    'session_token',v_session_token,
    'display_number',v_display_number,
    'position',v_position,
    'status','waiting',
    'business_name',v_business.name,
    'branch_name',v_branch.name,
    'service_id',v_service.id,
    'service_name',v_service.name
  );
end;
$$;

revoke all on function public.dashboard_issue_test_stub(uuid,uuid) from public,anon,service_role;
grant execute on function public.dashboard_issue_test_stub(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
