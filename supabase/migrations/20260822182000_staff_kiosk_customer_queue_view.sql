set local check_function_bodies = off;

-- Pre-Milestone 9 UX update:
-- The private customer ticket page may show the queue number list and
-- positions for the customer's own service. Other customer names are never
-- exposed; only the private token holder's own name is returned.

create or replace function public.get_public_ticket_status(
  target_session_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'ticket_id', t.id,
    'display_number', t.display_number,
    'status', t.status,
    'position', case
      when t.status = 'waiting' then (
        select count(*)::integer
        from public.tickets ahead
        where ahead.queue_session_id = t.queue_session_id
          and ahead.service_id = t.service_id
          and ahead.status = 'waiting'
          and ahead.ticket_number <= t.ticket_number
      )
      else 0
    end,
    'customer_name', coalesce(t.customer_name_override, c.name),
    'customer_phone', coalesce(t.customer_phone_override, c.phone),
    'customer_can_edit_name', qc.customer_can_edit_name,
    'customer_can_edit_mobile', qc.customer_can_edit_mobile,
    'business_name', b.name,
    'branch_name', br.name,
    'branch_phone', case
      when qc.show_branch_contact then br.phone
      else null
    end,
    'service_name', s.name,
    'joined_at', t.joined_at,
    'called_at', t.called_at,
    'serving_at', t.serving_at,
    'completed_at', t.completed_at,
    'queue_list', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'display_number', q.display_number,
          'position', q.position,
          'is_you', q.ticket_id = t.id,
          'customer_name', case
            when q.ticket_id = t.id then q.customer_name
            else null
          end
        )
        order by q.position
      )
      from (
        select
          waiting.id as ticket_id,
          waiting.display_number,
          row_number() over (
            order by waiting.ticket_number, waiting.joined_at
          )::integer as position,
          coalesce(
            waiting.customer_name_override,
            waiting_customer.name
          ) as customer_name
        from public.tickets waiting
        join public.customers waiting_customer
          on waiting_customer.id = waiting.customer_id
        where waiting.queue_session_id = t.queue_session_id
          and waiting.service_id = t.service_id
          and waiting.status = 'waiting'
      ) q
    ), '[]'::jsonb)
  )
  into v_result
  from public.customer_sessions cs
  join public.tickets t
    on t.customer_session_id = cs.id
  join public.customers c
    on c.id = t.customer_id
  join public.branches br
    on br.id = t.branch_id
  join public.businesses b
    on b.id = br.business_id
  join public.services s
    on s.id = t.service_id
  join public.queue_configurations qc
    on qc.branch_id = br.id
  where cs.session_token = target_session_token
    and cs.expires_at > now()
  order by t.created_at desc
  limit 1;

  return v_result;
end;
$$;

revoke all on function public.get_public_ticket_status(uuid)
  from public, service_role;
grant execute on function public.get_public_ticket_status(uuid)
  to anon, authenticated;
