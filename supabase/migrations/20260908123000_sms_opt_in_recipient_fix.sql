set local check_function_bodies = off;

-- QueueDrop SMS consent/recipient fix.
-- SMS queue alerts must use the ticket's explicit sms_phone opt-in only.
-- Customer profile/contact phone fields are not consent to receive queue SMS.

create or replace function public.enqueue_branch_position_notifications(
  target_branch_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_branch_name text;
  v_sms_enabled boolean := false;
  v_sms_start_position integer := 3;
  v_inserted integer := 0;
  v_rows integer := 0;
  v_candidate record;
  v_rule public.position_notification_rules%rowtype;
  v_phone text;
  v_message text;
begin
  select b.business_id, b.name,
         coalesce(qc.sms_notifications_enabled, false),
         coalesce(qc.sms_start_position, 3)
    into v_business_id, v_branch_name, v_sms_enabled, v_sms_start_position
  from public.branches b
  left join public.queue_configurations qc on qc.branch_id = b.id
  where b.id = target_branch_id;

  if v_business_id is null then
    return 0;
  end if;

  for v_candidate in
    with waiting as (
      select
        t.id as ticket_id,
        t.customer_id,
        t.customer_session_id,
        t.service_id,
        t.display_number,
        t.sms_phone as phone,
        t.sms_opted_in_at,
        s.name as service_name,
        row_number() over (
          partition by t.queue_session_id, t.service_id
          order by t.ticket_number, t.joined_at, t.id
        )::integer as queue_position
      from public.tickets t
      join public.queue_sessions qs on qs.id = t.queue_session_id
      join public.services s on s.id = t.service_id
      where t.branch_id = target_branch_id
        and t.status = 'waiting'
        and qs.status = 'open'
    )
    select * from waiting
  loop
    -- sms_phone exists only after explicit stub-level SMS opt-in.
    v_phone := nullif(btrim(v_candidate.phone), '');
    v_message := format(
      'QueueDrop: %s is now %s in line for %s at %s. Please be ready.',
      v_candidate.display_number,
      case
        when (v_candidate.queue_position % 100) between 11 and 13 then v_candidate.queue_position || 'th'
        when (v_candidate.queue_position % 10) = 1 then v_candidate.queue_position || 'st'
        when (v_candidate.queue_position % 10) = 2 then v_candidate.queue_position || 'nd'
        when (v_candidate.queue_position % 10) = 3 then v_candidate.queue_position || 'rd'
        else v_candidate.queue_position || 'th'
      end,
      v_candidate.service_name,
      v_branch_name
    );

    -- Threshold behavior: start_position 3 => positions 3, 2 and 1.
    if v_sms_enabled
       and v_candidate.queue_position <= v_sms_start_position
       and v_phone is not null then
      insert into public.notifications (
        business_id, branch_id, customer_id, ticket_id, channel,
        notification_type, recipient, message, status,
        position_rule_id, queue_position, payload
      ) values (
        v_business_id, target_branch_id, v_candidate.customer_id,
        v_candidate.ticket_id, 'sms', 'queue_position', v_phone,
        v_message, 'pending', null, v_candidate.queue_position,
        jsonb_build_object(
          'customer_session_id', v_candidate.customer_session_id,
          'service_id', v_candidate.service_id,
          'service_name', v_candidate.service_name,
          'display_number', v_candidate.display_number,
          'position', v_candidate.queue_position,
          'sms_start_position', v_sms_start_position,
          'sms_opted_in_at', v_candidate.sms_opted_in_at
        )
      ) on conflict do nothing;

      get diagnostics v_rows = row_count;
      v_inserted := v_inserted + v_rows;
    end if;

    -- Browser notifications remain driven by per-position rules and do not
    -- require an SMS phone number.
    for v_rule in
      select r.*
      from public.position_notification_rules r
      where r.branch_id = target_branch_id
        and r.position = v_candidate.queue_position
        and r.browser_notification
    loop
      insert into public.notifications (
        business_id, branch_id, customer_id, ticket_id, channel,
        notification_type, recipient, message, status,
        position_rule_id, queue_position, payload
      ) values (
        v_business_id, target_branch_id, v_candidate.customer_id,
        v_candidate.ticket_id, 'web', 'queue_position', null,
        v_message, 'pending', v_rule.id, v_candidate.queue_position,
        jsonb_build_object(
          'customer_session_id', v_candidate.customer_session_id,
          'service_id', v_candidate.service_id,
          'service_name', v_candidate.service_name,
          'display_number', v_candidate.display_number,
          'position', v_candidate.queue_position
        )
      ) on conflict do nothing;

      get diagnostics v_rows = row_count;
      v_inserted := v_inserted + v_rows;
    end loop;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.enqueue_branch_position_notifications(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.enqueue_branch_position_notifications(uuid)
  to postgres, service_role;

-- Saving/enabling the SMS threshold should immediately evaluate currently
-- waiting, explicitly opted-in tickets. The outbox unique index keeps this
-- idempotent, so resaving settings cannot duplicate the same position alert.
create or replace function public.set_branch_sms_position_settings(
  target_branch_id uuid,
  target_enabled boolean,
  target_start_position integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_manage_branch_settings(target_branch_id) then
    raise exception 'You cannot manage settings for this branch';
  end if;

  if target_start_position < 1 or target_start_position > 20 then
    raise exception 'SMS start position must be between 1 and 20';
  end if;

  insert into public.queue_configurations (
    branch_id,
    sms_notifications_enabled,
    sms_start_position
  ) values (
    target_branch_id,
    coalesce(target_enabled, false),
    target_start_position
  )
  on conflict (branch_id) do update set
    sms_notifications_enabled = excluded.sms_notifications_enabled,
    sms_start_position = excluded.sms_start_position;

  if coalesce(target_enabled, false) then
    perform public.enqueue_branch_position_notifications(target_branch_id);
  end if;
end;
$$;

revoke all on function public.set_branch_sms_position_settings(uuid, boolean, integer)
  from public, anon, service_role;
grant execute on function public.set_branch_sms_position_settings(uuid, boolean, integer)
  to authenticated;

notify pgrst, 'reload schema';
