-- Multi-service Get Stub terminals.
-- A terminal belongs to one branch; service_id is its default service only.
-- Multiple terminals may intentionally share the same default service.
set local check_function_bodies = off;

create or replace function public.get_stub_terminal(target_device_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'device_id', d.id,
    'device_name', d.name,
    'branch_id', br.id,
    'branch_name', br.name,
    'business_name', b.name,
    'service_id', ds.id,
    'service_name', ds.name,
    'queue_prefix', coalesce(nullif(ds.queue_prefix, ''), qc.ticket_prefix, 'Q'),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'queue_prefix', s.queue_prefix) order by s.name)
      from public.services s
      where s.branch_id = br.id and s.is_active = true
    ), '[]'::jsonb),
    'stub_mode_enabled', qc.stub_mode_enabled,
    'queue_active', qc.is_active,
    'branch_open', public.is_branch_open_now(br.id),
    'exit_pin_configured', b.kiosk_exit_pin_hash is not null
  ) into v_result
  from public.devices d
  join public.branches br on br.id = d.branch_id
  join public.businesses b on b.id = br.business_id
  join public.queue_configurations qc on qc.branch_id = br.id
  join public.services ds on ds.id = d.service_id and ds.branch_id = br.id
  where d.device_token = target_device_token
    and d.device_type = 'ticket_terminal'
    and d.is_active = true
    and br.status = 'active'
    and b.status = 'active'
    and ds.is_active = true
  limit 1;
  return v_result;
end;
$$;
revoke all on function public.get_stub_terminal(uuid) from public;
grant execute on function public.get_stub_terminal(uuid) to anon,authenticated,service_role;

create or replace function public.issue_stub_ticket_for_service(target_device_token uuid, target_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_device public.devices%rowtype; v_branch public.branches%rowtype; v_business public.businesses%rowtype;
  v_service public.services%rowtype; v_config public.queue_configurations%rowtype; v_session_date date;
  v_queue_session_id uuid; v_queue_status text; v_customer_session_id uuid; v_session_token uuid;
  v_ticket_number integer; v_display_number text; v_ticket_id uuid; v_position integer; v_prefix text;
  v_print_job_id uuid;
begin
  select * into v_device from public.devices
  where device_token=target_device_token and device_type='ticket_terminal' and is_active=true limit 1;
  if v_device.id is null then raise exception 'This QueueDrop terminal is not configured'; end if;

  select * into v_branch from public.branches where id=v_device.branch_id;
  select * into v_business from public.businesses where id=v_branch.business_id;
  select * into v_service from public.services
    where id=target_service_id and branch_id=v_branch.id and is_active=true;
  if v_service.id is null then raise exception 'Selected service is not available on this terminal branch'; end if;

  select * into v_config from public.queue_configurations where branch_id=v_branch.id;
  if v_business.status<>'active' or v_branch.status<>'active' then raise exception 'This queue is not available'; end if;
  if not coalesce(v_config.is_active,false) or not coalesce(v_config.stub_mode_enabled,false) then raise exception 'Stub issuing is currently disabled'; end if;
  if not public.is_branch_open_now(v_branch.id) then raise exception 'The branch is currently closed'; end if;

  begin v_session_date := (timezone(v_branch.timezone,now()))::date;
  exception when others then raise exception 'Branch timezone configuration is invalid'; end;

  insert into public.queue_sessions(branch_id,session_date,status,opened_at)
  values(v_branch.id,v_session_date,'open',now()) on conflict(branch_id,session_date) do nothing;

  select qs.id,qs.status into v_queue_session_id,v_queue_status
  from public.queue_sessions qs where qs.branch_id=v_branch.id and qs.session_date=v_session_date for update;
  if v_queue_status<>'open' then raise exception 'The queue is currently closed'; end if;

  insert into public.service_queue_counters(queue_session_id,service_id,current_number)
  values(v_queue_session_id,v_service.id,v_config.starting_number)
  on conflict(queue_session_id,service_id) do update
  set current_number=public.service_queue_counters.current_number+1,updated_at=now()
  returning current_number into v_ticket_number;

  update public.queue_sessions set current_number=current_number+1 where id=v_queue_session_id;
  v_prefix:=coalesce(nullif(v_service.queue_prefix,''),nullif(v_config.ticket_prefix,''),'Q');
  v_display_number:=v_prefix||lpad(v_ticket_number::text,3,'0');

  insert into public.customer_sessions(customer_id,branch_id,expires_at)
  values(null,v_branch.id,now()+interval '24 hours')
  returning id,session_token into v_customer_session_id,v_session_token;

  insert into public.tickets(queue_session_id,branch_id,service_id,customer_id,customer_session_id,ticket_number,display_number,status,source,issued_by_device_id)
  values(v_queue_session_id,v_branch.id,v_service.id,null,v_customer_session_id,v_ticket_number,v_display_number,'waiting','stub_terminal',v_device.id)
  returning id into v_ticket_id;

  insert into public.ticket_events(ticket_id,event_type,performed_by,notes)
  values(v_ticket_id,'waiting',null,'Stub issued by QueueDrop terminal '||v_device.name||' for service '||v_service.name);

  update public.devices set last_seen_at=now(),updated_at=now() where id=v_device.id;
  select count(*)::integer into v_position from public.tickets t
  where t.queue_session_id=v_queue_session_id and t.service_id=v_service.id and t.status='waiting' and t.ticket_number<=v_ticket_number;

  insert into public.print_jobs(business_id,branch_id,device_id,ticket_id,payload)
  values(v_business.id,v_branch.id,v_device.id,v_ticket_id,
    jsonb_build_object(
      'ticketId',v_ticket_id,'displayNumber',v_display_number,'businessName',v_business.name,
      'branchName',v_branch.name,'serviceName',v_service.name,'position',v_position,
      'sessionToken',v_session_token,
      'footer','Scan to check your live queue position. Add your mobile number only if you want SMS alerts.'
    )) returning id into v_print_job_id;

  return jsonb_build_object(
    'ticket_id',v_ticket_id,'print_job_id',v_print_job_id,'session_token',v_session_token,
    'display_number',v_display_number,'position',v_position,'status','waiting',
    'business_name',v_business.name,'branch_name',v_branch.name,'service_name',v_service.name
  );
end;
$$;
revoke all on function public.issue_stub_ticket_for_service(uuid,uuid) from public;
grant execute on function public.issue_stub_ticket_for_service(uuid,uuid) to anon,authenticated,service_role;

-- Keep the original one-argument RPC working for older clients. It simply uses
-- the terminal's configured default service.
create or replace function public.issue_stub_ticket(target_device_token uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_service_id uuid;
begin
  select service_id into v_service_id from public.devices
  where device_token=target_device_token and device_type='ticket_terminal' and is_active=true limit 1;
  if v_service_id is null then raise exception 'This QueueDrop terminal has no default service'; end if;
  return public.issue_stub_ticket_for_service(target_device_token,v_service_id);
end;
$$;
revoke all on function public.issue_stub_ticket(uuid) from public;
grant execute on function public.issue_stub_ticket(uuid) to anon,authenticated,service_role;

notify pgrst,'reload schema';
