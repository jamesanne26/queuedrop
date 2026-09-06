-- QueueDrop live queue operator workflow v4.
-- `called` remains the internal DB status for the UI Pending section.
-- Call next -> Pending. Serving tickets can be moved to Pending, completed,
-- or returned to the end of Waiting.
set local check_function_bodies = off;

create or replace function public.staff_call_next(
  target_branch_id uuid,
  target_service_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_business_id uuid;
  v_session_date date;
  v_timezone text;
  v_queue_session_id uuid;
  v_ticket public.tickets%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not public.can_operate_branch(target_branch_id) then
    raise exception 'You do not have permission to operate this branch queue';
  end if;

  select b.business_id, b.timezone into v_business_id, v_timezone
  from public.branches b
  where b.id = target_branch_id and b.status = 'active';
  if v_business_id is null then raise exception 'Branch is not available'; end if;

  if not exists (
    select 1 from public.services s
    where s.id = target_service_id and s.branch_id = target_branch_id and s.is_active = true
  ) then raise exception 'Service is not active for this branch'; end if;

  begin
    v_session_date := (timezone(v_timezone, now()))::date;
  exception when others then
    raise exception 'Branch timezone configuration is invalid';
  end;

  select qs.id into v_queue_session_id
  from public.queue_sessions qs
  where qs.branch_id = target_branch_id
    and qs.session_date = v_session_date
    and qs.status = 'open'
  limit 1;
  if v_queue_session_id is null then
    raise exception 'There is no open queue session for this branch today';
  end if;

  select t.* into v_ticket
  from public.tickets t
  where t.queue_session_id = v_queue_session_id
    and t.service_id = target_service_id
    and t.status = 'waiting'
  order by t.ticket_number, t.joined_at, t.id
  for update skip locked
  limit 1;
  if v_ticket.id is null then raise exception 'No waiting stub for this service'; end if;

  update public.tickets
  set status = 'called',
      called_at = now(),
      serving_at = null,
      updated_at = now()
  where id = v_ticket.id
  returning * into v_ticket;

  insert into public.ticket_events(ticket_id,event_type,performed_by,notes)
  values(v_ticket.id,'called',v_actor,'Staff called next stub to pending');

  insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,details)
  values(v_business_id,v_actor,'queue.ticket_called_to_pending','ticket',v_ticket.id,
    jsonb_build_object('branch_id',target_branch_id,'service_id',target_service_id,'display_number',v_ticket.display_number,'status',v_ticket.status));

  return jsonb_build_object('ticket_id',v_ticket.id,'display_number',v_ticket.display_number,'status',v_ticket.status);
end;
$$;

create or replace function public.staff_update_ticket_status(
  target_ticket_id uuid,
  target_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_ticket public.tickets%rowtype;
  v_business_id uuid;
  v_action text := lower(btrim(target_action));
  v_new_status public.ticket_status;
  v_note text;
  v_last_number integer;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;

  select t.* into v_ticket from public.tickets t where t.id = target_ticket_id for update;
  if v_ticket.id is null then raise exception 'Ticket not found'; end if;
  if not public.can_operate_branch(v_ticket.branch_id) then
    raise exception 'You do not have permission to operate this branch queue';
  end if;
  select b.business_id into v_business_id from public.branches b where b.id = v_ticket.branch_id;

  if v_action = 'pending' then
    if v_ticket.status <> 'serving' then raise exception 'Only a serving ticket can be moved to pending'; end if;
    update public.tickets set status='called',called_at=now(),serving_at=null,updated_at=now()
    where id=v_ticket.id returning * into v_ticket;
    v_new_status := 'called'; v_note := 'Staff moved stub to pending';

  elsif v_action = 'serve' then
    if v_ticket.status <> 'called' then raise exception 'Only a pending ticket can be moved to serving'; end if;
    update public.tickets set status='serving',serving_at=now(),updated_at=now()
    where id=v_ticket.id returning * into v_ticket;
    v_new_status := 'serving'; v_note := 'Staff moved pending stub to serving';

  elsif v_action = 'complete' then
    if v_ticket.status <> 'serving' then raise exception 'Only a serving ticket can be completed'; end if;
    update public.tickets set status='completed',completed_at=now(),updated_at=now()
    where id=v_ticket.id returning * into v_ticket;
    v_new_status := 'completed'; v_note := 'Staff completed service';

  elsif v_action = 'return_last' then
    if v_ticket.status <> 'serving' then raise exception 'Only a serving ticket can be returned to waiting'; end if;
    select coalesce(max(t.ticket_number),0) + 1 into v_last_number
    from public.tickets t
    where t.queue_session_id=v_ticket.queue_session_id and t.service_id=v_ticket.service_id;

    update public.tickets
    set status='waiting', ticket_number=v_last_number, called_at=null, serving_at=null, updated_at=now()
    where id=v_ticket.id returning * into v_ticket;

    insert into public.service_queue_counters(queue_session_id,service_id,current_number)
    values(v_ticket.queue_session_id,v_ticket.service_id,v_last_number)
    on conflict(queue_session_id,service_id) do update
      set current_number=greatest(public.service_queue_counters.current_number, excluded.current_number), updated_at=now();

    v_new_status := 'waiting'; v_note := 'Staff returned serving stub to end of waiting queue';

  elsif v_action = 'no_show' then
    if v_ticket.status not in ('waiting','called') then raise exception 'Only a waiting or pending ticket can be marked no-show'; end if;
    update public.tickets set status='no_show',updated_at=now() where id=v_ticket.id returning * into v_ticket;
    v_new_status := 'no_show'; v_note := 'Staff marked stub as no-show';

  elsif v_action = 'cancel' then
    if v_ticket.status not in ('waiting','called','serving') then raise exception 'This ticket can no longer be cancelled'; end if;
    update public.tickets set status='cancelled',cancelled_at=now(),updated_at=now() where id=v_ticket.id returning * into v_ticket;
    v_new_status := 'cancelled'; v_note := 'Staff cancelled stub';

  elsif v_action = 'recall' then
    if v_ticket.status <> 'called' then raise exception 'Only a pending ticket can be recalled'; end if;
    update public.tickets set called_at=now(),updated_at=now() where id=v_ticket.id returning * into v_ticket;
    v_new_status := 'called'; v_note := 'Staff recalled pending stub';

  else
    raise exception 'Unsupported ticket action';
  end if;

  insert into public.ticket_events(ticket_id,event_type,performed_by,notes)
  values(v_ticket.id,v_new_status,v_actor,v_note);
  insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,details)
  values(v_business_id,v_actor,'queue.ticket_'||v_action,'ticket',v_ticket.id,
    jsonb_build_object('branch_id',v_ticket.branch_id,'service_id',v_ticket.service_id,'display_number',v_ticket.display_number,'status',v_ticket.status));

  return jsonb_build_object('ticket_id',v_ticket.id,'display_number',v_ticket.display_number,'status',v_ticket.status);
end;
$$;

revoke all on function public.staff_call_next(uuid,uuid) from public,anon,service_role;
revoke all on function public.staff_update_ticket_status(uuid,text) from public,anon,service_role;
grant execute on function public.staff_call_next(uuid,uuid) to authenticated;
grant execute on function public.staff_update_ticket_status(uuid,text) to authenticated;
notify pgrst,'reload schema';
