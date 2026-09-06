-- QueueDrop: return one exact serving stub to the end of its waiting queue.
-- This avoids relying on the older generic status RPC, which does not know
-- the return_last action, and remains correct when several stubs are serving.

create or replace function public.staff_return_ticket_to_last(
  target_ticket_id uuid
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
  v_last_number integer;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select t.* into v_ticket
  from public.tickets t
  where t.id = target_ticket_id
  for update;

  if v_ticket.id is null then
    raise exception 'Ticket not found';
  end if;
  if not public.can_operate_branch(v_ticket.branch_id) then
    raise exception 'You do not have permission to operate this branch queue';
  end if;
  if v_ticket.status <> 'serving' then
    raise exception 'Only a serving stub can be returned to last';
  end if;

  select b.business_id into v_business_id
  from public.branches b
  where b.id = v_ticket.branch_id;

  select coalesce(max(t.ticket_number), 0) + 1
  into v_last_number
  from public.tickets t
  where t.queue_session_id = v_ticket.queue_session_id
    and t.service_id = v_ticket.service_id;

  update public.tickets
  set status = 'waiting',
      ticket_number = v_last_number,
      called_at = null,
      serving_at = null,
      updated_at = now()
  where id = v_ticket.id
  returning * into v_ticket;

  insert into public.service_queue_counters(queue_session_id, service_id, current_number)
  values(v_ticket.queue_session_id, v_ticket.service_id, v_last_number)
  on conflict(queue_session_id, service_id) do update
    set current_number = greatest(public.service_queue_counters.current_number, excluded.current_number),
        updated_at = now();

  insert into public.ticket_events(ticket_id, event_type, performed_by, notes)
  values(v_ticket.id, 'waiting', v_actor, 'Staff returned this stub to the end of the waiting queue');

  insert into public.audit_logs(business_id, user_id, action, entity_type, entity_id, details)
  values(
    v_business_id,
    v_actor,
    'queue.ticket_returned_to_last',
    'ticket',
    v_ticket.id,
    jsonb_build_object(
      'branch_id', v_ticket.branch_id,
      'service_id', v_ticket.service_id,
      'display_number', v_ticket.display_number,
      'ticket_number', v_ticket.ticket_number,
      'status', v_ticket.status
    )
  );

  return jsonb_build_object(
    'ticket_id', v_ticket.id,
    'display_number', v_ticket.display_number,
    'status', v_ticket.status,
    'ticket_number', v_ticket.ticket_number
  );
end;
$$;

revoke all on function public.staff_return_ticket_to_last(uuid) from public, anon, service_role;
grant execute on function public.staff_return_ticket_to_last(uuid) to authenticated;
notify pgrst, 'reload schema';
