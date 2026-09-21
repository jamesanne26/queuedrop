-- QueueDrop hard cleanup: stub-only customer entry.
-- Removes legacy QR/web joining, customer names, assisted joining, and move-down controls.
set local check_function_bodies = off;

-- Ticket-owned SMS opt-in replaces generic customer override fields.
alter table public.tickets add column if not exists sms_phone text;
update public.tickets set sms_phone = customer_phone_override where sms_phone is null and customer_phone_override is not null;

-- Freeze the new product model before removing legacy configuration fields.
update public.queue_configurations
set stub_mode_enabled = true,
    allow_qr_join = false,
    customer_can_edit_name = false,
    customer_can_edit_mobile = false,
    customer_can_move_down = false,
    staff_can_edit_name = false,
    staff_can_edit_mobile = false,
    manager_can_edit_name = false,
    manager_can_edit_mobile = false,
    updated_at = now();

-- Remove public/web customer-entry and customer-edit RPCs.
drop function if exists public.get_public_branch_queue(text,text);
drop function if exists public.join_public_queue(text,text,uuid,text,text);
drop function if exists public.join_public_queue_unchecked(text,text,uuid,text,text);
drop function if exists public.staff_assisted_join_queue(uuid,uuid,text,text);
drop function if exists public.update_public_ticket_customer(uuid,text,text);
drop function if exists public.update_ticket_customer_by_operator(uuid,text,text);
drop function if exists public.get_public_ticket_status(uuid);
drop function if exists public.leave_public_queue(uuid,text);
drop function if exists public.move_public_ticket_down_one(uuid,text);
drop function if exists public.set_branch_customer_move_down_setting(uuid,boolean);

-- Old settings RPC overloads reference fields removed below.
drop function if exists public.save_branch_queue_settings(uuid,text,integer,integer,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,jsonb,jsonb);
drop function if exists public.save_branch_queue_settings(uuid,integer,integer,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,jsonb,jsonb);

create or replace function public.save_stub_queue_settings(
  target_branch_id uuid,
  target_ticket_prefix text,
  target_starting_number integer,
  target_no_show_minutes integer,
  target_timezone text,
  target_is_active boolean,
  target_show_branch_contact boolean,
  target_hours jsonb,
  target_position_rules jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_role public.user_role;
  v_hour jsonb;
  v_rule jsonb;
begin
  if not public.can_manage_branch_settings(target_branch_id) then
    raise exception 'You cannot manage settings for this branch';
  end if;
  select b.business_id into v_business_id from public.branches b where b.id = target_branch_id;
  if v_business_id is null then raise exception 'Branch not found'; end if;
  select bu.role into v_role from public.business_users bu
  where bu.business_id = v_business_id and bu.user_id = auth.uid() and bu.is_active = true limit 1;
  if target_ticket_prefix !~ '^[A-Z0-9]{1,6}$' then raise exception 'Invalid queue prefix'; end if;
  if target_starting_number < 1 or target_starting_number > 999999 then raise exception 'Invalid starting number'; end if;
  if target_no_show_minutes < 0 or target_no_show_minutes > 1440 then raise exception 'Invalid no-show minutes'; end if;

  update public.branches set timezone = target_timezone where id = target_branch_id;
  insert into public.queue_configurations(branch_id,ticket_prefix,starting_number,no_show_minutes,is_active,show_branch_contact,stub_mode_enabled)
  values(target_branch_id,target_ticket_prefix,target_starting_number,target_no_show_minutes,target_is_active,target_show_branch_contact,true)
  on conflict(branch_id) do update set
    ticket_prefix=excluded.ticket_prefix, starting_number=excluded.starting_number,
    no_show_minutes=excluded.no_show_minutes, is_active=excluded.is_active,
    show_branch_contact=excluded.show_branch_contact, stub_mode_enabled=true, updated_at=now();

  delete from public.operating_hours where branch_id = target_branch_id;
  for v_hour in select value from jsonb_array_elements(coalesce(target_hours,'[]'::jsonb)) loop
    insert into public.operating_hours(branch_id,day_of_week,is_open,open_time,close_time)
    values(target_branch_id,(v_hour->>'day_of_week')::smallint,coalesce((v_hour->>'is_open')::boolean,false),
      case when coalesce((v_hour->>'is_open')::boolean,false) then (v_hour->>'open_time')::time else null end,
      case when coalesce((v_hour->>'is_open')::boolean,false) then (v_hour->>'close_time')::time else null end);
  end loop;

  delete from public.position_notification_rules where branch_id = target_branch_id;
  for v_rule in select value from jsonb_array_elements(coalesce(target_position_rules,'[]'::jsonb)) loop
    if (v_rule->>'position')::integer < 1 then raise exception 'Notification position must be at least 1'; end if;
    insert into public.position_notification_rules(branch_id,position,send_sms_once,browser_notification)
    values(target_branch_id,(v_rule->>'position')::integer,false,coalesce((v_rule->>'browser_notification')::boolean,false));
  end loop;

  insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,details)
  values(v_business_id,auth.uid(),'queue.settings_updated','branch',target_branch_id,jsonb_build_object('role',v_role,'mode','stub_only'));
end;
$$;
revoke all on function public.save_stub_queue_settings(uuid,text,integer,integer,text,boolean,boolean,jsonb,jsonb) from public,anon,service_role;
grant execute on function public.save_stub_queue_settings(uuid,text,integer,integer,text,boolean,boolean,jsonb,jsonb) to authenticated;

-- Stub issuance creates no customer/person record.
create or replace function public.issue_stub_ticket(target_device_token uuid)
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
  if not coalesce(v_config.is_active,false) or not coalesce(v_config.stub_mode_enabled,false) then raise exception 'Stub issuing is currently disabled'; end if;
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
  values(v_queue_session_id,v_branch.id,v_service.id,null,v_customer_session_id,v_ticket_number,v_display_number,'waiting','stub_terminal',v_device.id) returning id into v_ticket_id;
  insert into public.ticket_events(ticket_id,event_type,performed_by,notes) values(v_ticket_id,'waiting',null,'Stub issued by QueueDrop terminal '||v_device.name);
  update public.devices set last_seen_at=now(),updated_at=now() where id=v_device.id;
  select count(*)::integer into v_position from public.tickets t where t.queue_session_id=v_queue_session_id and t.service_id=v_service.id and t.status='waiting' and t.ticket_number<=v_ticket_number;
  return jsonb_build_object('ticket_id',v_ticket_id,'session_token',v_session_token,'display_number',v_display_number,'position',v_position,'status','waiting','business_name',v_business.name,'branch_name',v_branch.name,'service_name',v_service.name);
end; $$;
revoke all on function public.issue_stub_ticket(uuid) from public;
grant execute on function public.issue_stub_ticket(uuid) to anon,authenticated,service_role;

create or replace function public.set_stub_sms_number(target_session_token uuid,target_phone text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_ticket public.tickets%rowtype; v_phone text;
begin
  v_phone:=nullif(btrim(coalesce(target_phone,'')),'');
  if v_phone is null or v_phone !~ '^[0-9]{1,20}$' then raise exception 'Mobile number must contain numbers only'; end if;
  select t.* into v_ticket from public.customer_sessions cs join public.tickets t on t.customer_session_id=cs.id
  where cs.session_token=target_session_token and cs.expires_at>now() order by t.created_at desc limit 1;
  if v_ticket.id is null then raise exception 'Queue stub is not available'; end if;
  if v_ticket.status not in ('waiting','called') then raise exception 'SMS notification can no longer be changed for this stub'; end if;
  update public.tickets set sms_phone=v_phone,updated_at=now() where id=v_ticket.id;
  return public.get_stub_ticket_status(target_session_token);
end; $$;
revoke all on function public.set_stub_sms_number(uuid,text) from public;
grant execute on function public.set_stub_sms_number(uuid,text) to anon,authenticated,service_role;

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
  return jsonb_build_object('ticket_id',v_ticket.id,'display_number',v_ticket.display_number,'status',v_ticket.status,'position',coalesce(v_position,0),'sms_phone',v_ticket.sms_phone,'customer_refresh_seconds',v_refresh,'business_name',v_business_name,'branch_name',v_branch_name,'service_name',v_service_name,'queue_list',v_queue);
end; $$;
revoke all on function public.get_stub_ticket_status(uuid) from public;
grant execute on function public.get_stub_ticket_status(uuid) to anon,authenticated,service_role;

create or replace function public.enqueue_branch_position_notifications(target_branch_id uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_business_id uuid; v_branch_name text; v_enabled boolean:=false; v_start integer:=3; v_inserted integer:=0; v_rows integer:=0; v record; v_message text;
begin
  select b.business_id,b.name,coalesce(qc.sms_notifications_enabled,false),coalesce(qc.sms_start_position,3)
  into v_business_id,v_branch_name,v_enabled,v_start from public.branches b left join public.queue_configurations qc on qc.branch_id=b.id where b.id=target_branch_id;
  if v_business_id is null then return 0; end if;
  for v in
    select t.id ticket_id,t.customer_session_id,t.service_id,t.display_number,t.sms_phone phone,s.name service_name,
      row_number() over(partition by t.queue_session_id,t.service_id order by t.ticket_number,t.joined_at,t.id)::integer queue_position
    from public.tickets t join public.queue_sessions qs on qs.id=t.queue_session_id join public.services s on s.id=t.service_id
    where t.branch_id=target_branch_id and t.status='waiting' and qs.status='open'
  loop
    if v_enabled and v.queue_position<=v_start and nullif(btrim(v.phone),'') is not null then
      v_message:=format('QueueDrop: %s is now #%s in line for %s at %s. Please be ready.',v.display_number,v.queue_position,v.service_name,v_branch_name);
      insert into public.notifications(business_id,branch_id,customer_id,ticket_id,channel,notification_type,recipient,message,status,position_rule_id,queue_position,payload)
      values(v_business_id,target_branch_id,null,v.ticket_id,'sms','queue_position',v.phone,v_message,'pending',null,v.queue_position,jsonb_build_object('service_id',v.service_id,'service_name',v.service_name,'display_number',v.display_number,'position',v.queue_position,'sms_start_position',v_start)) on conflict do nothing;
      get diagnostics v_rows=row_count; v_inserted:=v_inserted+v_rows;
    end if;
  end loop;
  return v_inserted;
end; $$;

-- Drop name/edit/move-down/web-join schema fields now that no active code uses them.
alter table public.tickets drop column if exists customer_name_override;
alter table public.tickets drop column if exists customer_phone_override;
-- These legacy configuration columns are retained only for compatibility with
-- older branch-creation RPCs already present in migration history. A trigger
-- permanently normalizes them off so they cannot reactivate removed features.
create or replace function public.enforce_stub_only_queue_config()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  new.stub_mode_enabled := true;
  new.allow_qr_join := false;
  new.customer_can_edit_name := false;
  new.customer_can_edit_mobile := false;
  new.customer_can_move_down := false;
  new.staff_can_edit_name := false;
  new.staff_can_edit_mobile := false;
  new.manager_can_edit_name := false;
  new.manager_can_edit_mobile := false;
  return new;
end; $$;
drop trigger if exists trg_enforce_stub_only_queue_config on public.queue_configurations;
create trigger trg_enforce_stub_only_queue_config before insert or update on public.queue_configurations
for each row execute function public.enforce_stub_only_queue_config();

-- Change-history table existed only for customer name/mobile/move-down edits.
drop table if exists public.ticket_customer_changes;

notify pgrst,'reload schema';
