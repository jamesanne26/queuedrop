set local check_function_bodies = off;

insert into public.position_notification_rules (branch_id, position, send_sms_once, browser_notification)
select b.id, p.position, false, false from public.branches b
cross join (values (1), (2), (3)) as p(position)
where not exists (select 1 from public.position_notification_rules r where r.branch_id = b.id)
on conflict (branch_id, position) do nothing;

update public.queue_configurations set sms_notifications_enabled = false, sms_start_position = 3;

create or replace function public.enqueue_branch_position_notifications(target_branch_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_business_id uuid; v_branch_name text; v_inserted integer := 0; v_rows integer := 0;
  v_candidate record; v_rule public.position_notification_rules%rowtype; v_phone text; v_message text;
begin
  select b.business_id, b.name into v_business_id, v_branch_name from public.branches b where b.id = target_branch_id;
  if v_business_id is null then return 0; end if;
  for v_candidate in
    with waiting as (
      select t.id ticket_id,t.customer_id,t.customer_session_id,t.service_id,t.display_number,t.sms_phone phone,t.sms_opted_in_at,s.name service_name,
        row_number() over (partition by t.queue_session_id,t.service_id order by t.ticket_number,t.joined_at,t.id)::integer queue_position
      from public.tickets t join public.queue_sessions qs on qs.id=t.queue_session_id join public.services s on s.id=t.service_id
      where t.branch_id=target_branch_id and t.status='waiting' and qs.status='open'
    ) select * from waiting
  loop
    select * into v_rule from public.position_notification_rules r where r.branch_id=target_branch_id and r.position=v_candidate.queue_position;
    if not found then continue; end if;
    v_phone := nullif(btrim(v_candidate.phone),'');
    v_message := format('QueueDrop: %s is now position %s for %s at %s. Please be ready.',v_candidate.display_number,v_candidate.queue_position,v_candidate.service_name,v_branch_name);
    if v_rule.send_sms_once and v_phone is not null then
      insert into public.notifications (business_id,branch_id,customer_id,ticket_id,channel,notification_type,recipient,message,status,position_rule_id,queue_position,payload)
      values (v_business_id,target_branch_id,v_candidate.customer_id,v_candidate.ticket_id,'sms','queue_position',v_phone,v_message,'pending',v_rule.id,v_candidate.queue_position,
        jsonb_build_object('customer_session_id',v_candidate.customer_session_id,'service_id',v_candidate.service_id,'service_name',v_candidate.service_name,'display_number',v_candidate.display_number,'position',v_candidate.queue_position,'sms_opted_in_at',v_candidate.sms_opted_in_at)) on conflict do nothing;
      get diagnostics v_rows=row_count; v_inserted:=v_inserted+v_rows;
    end if;
    if v_rule.browser_notification then
      insert into public.notifications (business_id,branch_id,customer_id,ticket_id,channel,notification_type,recipient,message,status,position_rule_id,queue_position,payload)
      values (v_business_id,target_branch_id,v_candidate.customer_id,v_candidate.ticket_id,'web','queue_position',null,v_message,'pending',v_rule.id,v_candidate.queue_position,
        jsonb_build_object('customer_session_id',v_candidate.customer_session_id,'service_id',v_candidate.service_id,'service_name',v_candidate.service_name,'display_number',v_candidate.display_number,'position',v_candidate.queue_position)) on conflict do nothing;
      get diagnostics v_rows=row_count; v_inserted:=v_inserted+v_rows;
    end if;
  end loop;
  return v_inserted;
end; $$;

create or replace function public.finalize_closed_branch_tickets()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer := 0;
begin
  with due as (
    select t.id from public.tickets t
    join public.branches b on b.id=t.branch_id
    join public.operating_hours oh on oh.branch_id=b.id and oh.day_of_week=extract(dow from (now() at time zone coalesce(b.timezone,'Asia/Manila')))::integer
    where t.status in ('waiting','called','serving') and oh.is_open
      and (now() at time zone coalesce(b.timezone,'Asia/Manila'))::time >= oh.close_time
      and (t.joined_at at time zone coalesce(b.timezone,'Asia/Manila'))::date <= (now() at time zone coalesce(b.timezone,'Asia/Manila'))::date
  ), changed as (
    update public.tickets t set status='not_completed',updated_at=now() where t.id in (select id from due) returning t.id
  ) select count(*) into v_count from changed;
  return v_count;
end; $$;

revoke all on function public.finalize_closed_branch_tickets() from public,anon,authenticated;
grant execute on function public.finalize_closed_branch_tickets() to postgres,service_role;
notify pgrst, 'reload schema';
