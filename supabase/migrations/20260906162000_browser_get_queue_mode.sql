-- Browser-only GET QUEUE mode. Uses the same terminal branch/service assignment
-- as Get Stub but deliberately creates no print job.
set local check_function_bodies = off;

create or replace function public.issue_browser_queue_ticket(target_device_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_device public.devices%rowtype; v_branch public.branches%rowtype; v_business public.businesses%rowtype;
  v_service public.services%rowtype; v_config public.queue_configurations%rowtype; v_session_date date;
  v_queue_session_id uuid; v_queue_status text; v_customer_session_id uuid; v_session_token uuid;
  v_ticket_number integer; v_display_number text; v_ticket_id uuid; v_position integer; v_prefix text;
begin
  select * into v_device from public.devices where device_token=target_device_token and device_type='ticket_terminal' and is_active=true limit 1;
  if v_device.id is null or v_device.service_id is null then raise exception 'This QueueDrop terminal is not configured'; end if;
  select * into v_branch from public.branches where id=v_device.branch_id;
  select * into v_business from public.businesses where id=v_branch.business_id;
  select * into v_service from public.services where id=v_device.service_id and branch_id=v_branch.id;
  select * into v_config from public.queue_configurations where branch_id=v_branch.id;
  if v_business.status<>'active' or v_branch.status<>'active' or not coalesce(v_service.is_active,false) then raise exception 'This queue is not available'; end if;
  if not coalesce(v_config.is_active,false) then raise exception 'Queue issuing is currently disabled'; end if;
  if not public.is_branch_open_now(v_branch.id) then raise exception 'The branch is currently closed'; end if;
  begin v_session_date := (timezone(v_branch.timezone,now()))::date; exception when others then raise exception 'Branch timezone configuration is invalid'; end;
  insert into public.queue_sessions(branch_id,session_date,status,opened_at) values(v_branch.id,v_session_date,'open',now()) on conflict(branch_id,session_date) do nothing;
  select qs.id,qs.status into v_queue_session_id,v_queue_status from public.queue_sessions qs where qs.branch_id=v_branch.id and qs.session_date=v_session_date for update;
  if v_queue_status<>'open' then raise exception 'The queue is currently closed'; end if;
  insert into public.service_queue_counters(queue_session_id,service_id,current_number)
  values(v_queue_session_id,v_service.id,v_config.starting_number)
  on conflict(queue_session_id,service_id) do update set current_number=public.service_queue_counters.current_number+1,updated_at=now()
  returning current_number into v_ticket_number;
  update public.queue_sessions set current_number=current_number+1 where id=v_queue_session_id;
  v_prefix:=coalesce(nullif(v_service.queue_prefix,''),nullif(v_config.ticket_prefix,''),'Q');
  v_display_number:=v_prefix||lpad(v_ticket_number::text,3,'0');
  insert into public.customer_sessions(customer_id,branch_id,expires_at) values(null,v_branch.id,now()+interval '24 hours') returning id,session_token into v_customer_session_id,v_session_token;
  insert into public.tickets(queue_session_id,branch_id,service_id,customer_id,customer_session_id,ticket_number,display_number,status,source,issued_by_device_id)
  values(v_queue_session_id,v_branch.id,v_service.id,null,v_customer_session_id,v_ticket_number,v_display_number,'waiting','web',v_device.id) returning id into v_ticket_id;
  insert into public.ticket_events(ticket_id,event_type,performed_by,notes) values(v_ticket_id,'waiting',null,'Browser queue issued by QueueDrop terminal '||v_device.name);
  update public.devices set last_seen_at=now(),updated_at=now() where id=v_device.id;
  select count(*)::integer into v_position from public.tickets t where t.queue_session_id=v_queue_session_id and t.service_id=v_service.id and t.status='waiting' and t.ticket_number<=v_ticket_number;
  return jsonb_build_object('ticket_id',v_ticket_id,'session_token',v_session_token,'display_number',v_display_number,'position',v_position,'status','waiting','business_name',v_business.name,'branch_name',v_branch.name,'service_name',v_service.name,'source','web');
end; $$;
revoke all on function public.issue_browser_queue_ticket(uuid) from public;
grant execute on function public.issue_browser_queue_ticket(uuid) to anon,authenticated,service_role;

create or replace function public.get_stub_ticket_status(target_session_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_ticket public.tickets%rowtype; v_business_name text; v_branch_name text; v_service_name text; v_refresh integer; v_position integer; v_queue jsonb;
begin
  select t.* into v_ticket from public.customer_sessions cs join public.tickets t on t.customer_session_id=cs.id
  where cs.session_token=target_session_token and cs.expires_at>now() order by t.created_at desc limit 1;
  if v_ticket.id is null then return null; end if;
  select b.name,bus.name,s.name,coalesce(qc.customer_refresh_seconds,8)
    into v_branch_name,v_business_name,v_service_name,v_refresh
  from public.branches b join public.businesses bus on bus.id=b.business_id join public.services s on s.id=v_ticket.service_id
  left join public.queue_configurations qc on qc.branch_id=b.id where b.id=v_ticket.branch_id;
  if v_ticket.status='waiting' then
    select count(*)::integer into v_position from public.tickets t where t.queue_session_id=v_ticket.queue_session_id and t.service_id=v_ticket.service_id and t.status='waiting' and t.ticket_number<=v_ticket.ticket_number;
  else v_position:=0; end if;
  select coalesce(jsonb_agg(jsonb_build_object('display_number',x.display_number,'position',x.pos,'is_you',x.id=v_ticket.id) order by x.pos),'[]'::jsonb)
  into v_queue from (select t.id,t.display_number,row_number() over(order by t.ticket_number,t.joined_at,t.id)::integer pos from public.tickets t where t.queue_session_id=v_ticket.queue_session_id and t.service_id=v_ticket.service_id and t.status='waiting') x;
  return jsonb_build_object('ticket_id',v_ticket.id,'display_number',v_ticket.display_number,'status',v_ticket.status,'position',coalesce(v_position,0),'sms_phone',v_ticket.sms_phone,'customer_refresh_seconds',v_refresh,'business_name',v_business_name,'branch_name',v_branch_name,'service_name',v_service_name,'queue_list',v_queue,'source',v_ticket.source);
end; $$;
revoke all on function public.get_stub_ticket_status(uuid) from public;
grant execute on function public.get_stub_ticket_status(uuid) to anon,authenticated,service_role;
