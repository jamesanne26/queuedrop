-- QueueDrop: restore the staff ticket status RPC.
-- Required by Serve, Complete, No-show, Cancel, and Recall actions.

set local check_function_bodies = off;

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
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select t.*
  into v_ticket
  from public.tickets t
  where t.id = target_ticket_id
  for update;

  if v_ticket.id is null then
    raise exception 'Ticket not found';
  end if;

  if not public.can_operate_branch(v_ticket.branch_id) then
    raise exception 'You do not have permission to operate this branch queue';
  end if;

  select b.business_id
  into v_business_id
  from public.branches b
  where b.id = v_ticket.branch_id;

  if v_action = 'recall' then
    if v_ticket.status <> 'called' then
      raise exception 'Only a called ticket can be recalled';
    end if;

    update public.tickets
    set called_at = now()
    where id = v_ticket.id
    returning * into v_ticket;

    v_new_status := 'called';
    v_note := 'Staff recalled customer';

  elsif v_action = 'serve' then
    if v_ticket.status <> 'called' then
      raise exception 'Only a called ticket can start service';
    end if;

    update public.tickets
    set status = 'serving', serving_at = now()
    where id = v_ticket.id
    returning * into v_ticket;

    v_new_status := 'serving';
    v_note := 'Staff started serving customer';

  elsif v_action = 'complete' then
    if v_ticket.status <> 'serving' then
      raise exception 'Only a serving ticket can be completed';
    end if;

    update public.tickets
    set status = 'completed', completed_at = now()
    where id = v_ticket.id
    returning * into v_ticket;

    v_new_status := 'completed';
    v_note := 'Staff completed service';

  elsif v_action = 'no_show' then
    if v_ticket.status not in ('waiting', 'called') then
      raise exception 'Only a waiting or called ticket can be marked no-show';
    end if;

    update public.tickets
    set status = 'no_show'
    where id = v_ticket.id
    returning * into v_ticket;

    v_new_status := 'no_show';
    v_note := 'Staff marked customer as no-show';

  elsif v_action = 'cancel' then
    if v_ticket.status not in ('waiting', 'called', 'serving') then
      raise exception 'This ticket can no longer be cancelled';
    end if;

    update public.tickets
    set status = 'cancelled', cancelled_at = now()
    where id = v_ticket.id
    returning * into v_ticket;

    v_new_status := 'cancelled';
    v_note := 'Staff cancelled ticket';

  else
    raise exception 'Unsupported ticket action';
  end if;

  insert into public.ticket_events (
    ticket_id,
    event_type,
    performed_by,
    notes
  )
  values (
    v_ticket.id,
    v_new_status,
    v_actor,
    v_note
  );

  insert into public.audit_logs (
    business_id,
    user_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    v_business_id,
    v_actor,
    'queue.ticket_' || v_action,
    'ticket',
    v_ticket.id,
    jsonb_build_object(
      'branch_id', v_ticket.branch_id,
      'service_id', v_ticket.service_id,
      'display_number', v_ticket.display_number,
      'status', v_ticket.status
    )
  );

  return jsonb_build_object(
    'ticket_id', v_ticket.id,
    'display_number', v_ticket.display_number,
    'status', v_ticket.status
  );
end;
$$;

revoke all on function public.staff_update_ticket_status(uuid, text)
from public, anon, service_role;

grant execute on function public.staff_update_ticket_status(uuid, text)
to authenticated;

notify pgrst, 'reload schema';
