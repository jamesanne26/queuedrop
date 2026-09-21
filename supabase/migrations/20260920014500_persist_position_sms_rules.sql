-- Preserve the per-position SMS checkbox when branch notification rules are saved.
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

  select b.business_id into v_business_id
  from public.branches b
  where b.id = target_branch_id;

  if v_business_id is null then
    raise exception 'Branch not found';
  end if;

  select bu.role into v_role
  from public.business_users bu
  where bu.business_id = v_business_id
    and bu.user_id = auth.uid()
    and bu.is_active = true
  limit 1;

  if target_ticket_prefix !~ '^[A-Z0-9]{1,6}$' then
    raise exception 'Invalid queue prefix';
  end if;
  if target_starting_number < 1 or target_starting_number > 999999 then
    raise exception 'Invalid starting number';
  end if;
  if target_no_show_minutes < 0 or target_no_show_minutes > 1440 then
    raise exception 'Invalid no-show minutes';
  end if;

  update public.branches
  set timezone = target_timezone
  where id = target_branch_id;

  insert into public.queue_configurations(
    branch_id, ticket_prefix, starting_number, no_show_minutes,
    is_active, show_branch_contact, stub_mode_enabled
  )
  values(
    target_branch_id, target_ticket_prefix, target_starting_number,
    target_no_show_minutes, target_is_active, target_show_branch_contact, true
  )
  on conflict(branch_id) do update set
    ticket_prefix = excluded.ticket_prefix,
    starting_number = excluded.starting_number,
    no_show_minutes = excluded.no_show_minutes,
    is_active = excluded.is_active,
    show_branch_contact = excluded.show_branch_contact,
    stub_mode_enabled = true,
    updated_at = now();

  delete from public.operating_hours where branch_id = target_branch_id;
  for v_hour in
    select value from jsonb_array_elements(coalesce(target_hours, '[]'::jsonb))
  loop
    insert into public.operating_hours(
      branch_id, day_of_week, is_open, open_time, close_time
    )
    values(
      target_branch_id,
      (v_hour->>'day_of_week')::smallint,
      coalesce((v_hour->>'is_open')::boolean, false),
      case when coalesce((v_hour->>'is_open')::boolean, false)
        then (v_hour->>'open_time')::time else null end,
      case when coalesce((v_hour->>'is_open')::boolean, false)
        then (v_hour->>'close_time')::time else null end
    );
  end loop;

  delete from public.position_notification_rules
  where branch_id = target_branch_id;

  for v_rule in
    select value from jsonb_array_elements(coalesce(target_position_rules, '[]'::jsonb))
  loop
    if (v_rule->>'position')::integer < 1 then
      raise exception 'Notification position must be at least 1';
    end if;

    insert into public.position_notification_rules(
      branch_id, position, send_sms_once, browser_notification
    )
    values(
      target_branch_id,
      (v_rule->>'position')::integer,
      coalesce((v_rule->>'send_sms_once')::boolean, false),
      coalesce((v_rule->>'browser_notification')::boolean, false)
    );
  end loop;

  insert into public.audit_logs(
    business_id, user_id, action, entity_type, entity_id, details
  )
  values(
    v_business_id,
    auth.uid(),
    'queue.settings_updated',
    'branch',
    target_branch_id,
    jsonb_build_object('role', v_role, 'mode', 'stub_only')
  );
end;
$$;

revoke all on function public.save_stub_queue_settings(
  uuid, text, integer, integer, text, boolean, boolean, jsonb, jsonb
) from public, anon, service_role;

grant execute on function public.save_stub_queue_settings(
  uuid, text, integer, integer, text, boolean, boolean, jsonb, jsonb
) to authenticated;
