-- QueueDrop: optional customer self-service "move down one place" control.
-- The move is service-specific, requires the private ticket confirmation code,
-- is concurrency-safe, and is recorded in the same change-history stream used
-- by staff for customer ticket changes.

set local check_function_bodies = off;

alter table public.queue_configurations
  add column if not exists customer_can_move_down boolean not null default false;

alter table public.ticket_customer_changes
  drop constraint if exists ticket_customer_changes_field_name_check;

alter table public.ticket_customer_changes
  add constraint ticket_customer_changes_field_name_check
  check (field_name in ('name', 'mobile', 'queue_position'));

alter table public.ticket_customer_changes
  add column if not exists changed_by_label text;

create or replace function public.set_branch_customer_move_down_setting(
  target_branch_id uuid,
  target_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_business_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_manage_branch_settings(target_branch_id) then
    raise exception 'You do not have permission to manage this branch';
  end if;

  select b.business_id into v_business_id
  from public.branches b
  where b.id = target_branch_id;

  if v_business_id is null then
    raise exception 'Branch not found';
  end if;

  update public.queue_configurations
  set customer_can_move_down = coalesce(target_enabled, false),
      updated_at = now()
  where branch_id = target_branch_id;

  if not found then
    insert into public.queue_configurations (branch_id, customer_can_move_down)
    values (target_branch_id, coalesce(target_enabled, false));
  end if;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (
    v_business_id,
    v_actor,
    'queue.customer_move_down_setting_updated',
    'branch',
    target_branch_id,
    jsonb_build_object('customer_can_move_down', coalesce(target_enabled, false))
  );
end;
$$;

revoke all on function public.set_branch_customer_move_down_setting(uuid, boolean)
  from public, anon, service_role;
grant execute on function public.set_branch_customer_move_down_setting(uuid, boolean)
  to authenticated;

create or replace function public.move_public_ticket_down_one(
  target_session_token uuid,
  target_confirmation_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket public.tickets%rowtype;
  v_next public.tickets%rowtype;
  v_config public.queue_configurations%rowtype;
  v_expected_code text;
  v_old_position integer;
  v_temp_ticket_number integer;
  v_actor uuid := auth.uid();
  v_actor_type text := 'customer';
  v_actor_label text;
  v_actor_name text;
begin
  select t.*
  into v_ticket
  from public.customer_sessions cs
  join public.tickets t on t.customer_session_id = cs.id
  where cs.session_token = target_session_token
    and cs.expires_at > now()
  order by t.created_at desc
  limit 1;

  select cs.exit_code
  into v_expected_code
  from public.customer_sessions cs
  where cs.id = v_ticket.customer_session_id
  limit 1;

  if v_ticket.id is null then
    raise exception 'Queue ticket is not available';
  end if;

  if v_ticket.status <> 'waiting' then
    raise exception 'Only a waiting customer can move down the queue';
  end if;

  select * into v_config
  from public.queue_configurations
  where branch_id = v_ticket.branch_id;

  if not coalesce(v_config.customer_can_move_down, false) then
    raise exception 'Moving down the queue is disabled for this branch';
  end if;

  if upper(btrim(coalesce(target_confirmation_code, ''))) <> upper(btrim(coalesce(v_expected_code, ''))) then
    raise exception 'Confirmation code is incorrect';
  end if;

  -- Serialize moves within the same service queue so two customers cannot
  -- swap against the same next ticket at the same time.
  perform pg_advisory_xact_lock(hashtext(v_ticket.queue_session_id::text));

  -- Re-read after acquiring the service queue lock.
  select t.* into v_ticket
  from public.tickets t
  where t.id = v_ticket.id
  for update;

  if v_ticket.status <> 'waiting' then
    raise exception 'Your queue position changed before this request completed. Please try again';
  end if;

  select t.* into v_next
  from public.tickets t
  where t.queue_session_id = v_ticket.queue_session_id
    and t.service_id = v_ticket.service_id
    and t.status = 'waiting'
    and t.ticket_number > v_ticket.ticket_number
  order by t.ticket_number, t.joined_at
  for update
  limit 1;

  if v_next.id is null then
    raise exception 'There is no customer behind you to move ahead';
  end if;

  select count(*)::integer into v_old_position
  from public.tickets ahead
  where ahead.queue_session_id = v_ticket.queue_session_id
    and ahead.service_id = v_ticket.service_id
    and ahead.status = 'waiting'
    and ahead.ticket_number <= v_ticket.ticket_number;

  select coalesce(min(t.ticket_number), 0) - 1
  into v_temp_ticket_number
  from public.tickets t
  where t.queue_session_id = v_ticket.queue_session_id;

  -- ticket_number is internal ordering. display_number remains unchanged.
  update public.tickets
  set ticket_number = v_temp_ticket_number, updated_at = now()
  where id = v_next.id;

  update public.tickets
  set ticket_number = v_next.ticket_number, updated_at = now()
  where id = v_ticket.id;

  update public.tickets
  set ticket_number = v_ticket.ticket_number, updated_at = now()
  where id = v_next.id;

  if v_actor is not null then
    select bu.role::text, p.full_name
    into v_actor_type, v_actor_name
    from public.business_users bu
    left join public.profiles p on p.id = bu.user_id
    join public.branches b on b.business_id = bu.business_id
    where b.id = v_ticket.branch_id
      and bu.user_id = v_actor
      and bu.is_active = true
    limit 1;
  end if;

  if v_actor_type is null or v_actor_type not in ('staff', 'manager', 'admin', 'owner') then
    v_actor := null;
    v_actor_type := 'customer';
    v_actor_label := 'Customer ' || v_ticket.display_number;
  else
    v_actor_label := initcap(v_actor_type) || coalesce(': ' || nullif(v_actor_name, ''), '');
  end if;

  insert into public.ticket_customer_changes (
    ticket_id, field_name, old_value, new_value, changed_by_type, changed_by_user_id, changed_by_label
  ) values
    (v_ticket.id, 'queue_position', v_old_position::text, (v_old_position + 1)::text, v_actor_type, v_actor, v_actor_label),
    (v_next.id, 'queue_position', (v_old_position + 1)::text, v_old_position::text, v_actor_type, v_actor, v_actor_label);

  insert into public.ticket_events (ticket_id, event_type, performed_by, notes)
  values (
    v_ticket.id,
    'waiting',
    v_actor,
    'Customer moved down one queue position and let ' || v_next.display_number || ' move ahead'
  );

  return public.get_public_ticket_status(target_session_token);
end;
$$;

revoke all on function public.move_public_ticket_down_one(uuid, text)
  from public, service_role;
grant execute on function public.move_public_ticket_down_one(uuid, text)
  to anon, authenticated;

create or replace function public.get_public_ticket_status(target_session_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'ticket_id', t.id,
    'display_number', t.display_number,
    'status', t.status,
    'position', case when t.status = 'waiting' then (
      select count(*)::integer from public.tickets ahead
      where ahead.queue_session_id = t.queue_session_id
        and ahead.service_id = t.service_id
        and ahead.status = 'waiting'
        and ahead.ticket_number <= t.ticket_number
    ) else 0 end,
    'customer_name', coalesce(t.customer_name_override, c.name),
    'customer_phone', coalesce(t.customer_phone_override, c.phone),
    'customer_can_edit_name', qc.customer_can_edit_name,
    'customer_can_edit_mobile', qc.customer_can_edit_mobile,
    'customer_can_move_down', qc.customer_can_move_down,
    'customer_refresh_seconds', qc.customer_refresh_seconds,
    'exit_code', cs.exit_code,
    'business_name', b.name,
    'branch_name', br.name,
    'branch_phone', case when qc.show_branch_contact then br.phone else null end,
    'service_name', s.name,
    'joined_at', t.joined_at,
    'called_at', t.called_at,
    'serving_at', t.serving_at,
    'completed_at', t.completed_at,
    'queue_list', coalesce((
      select jsonb_agg(jsonb_build_object(
        'display_number', q.display_number,
        'position', q.position,
        'is_you', q.ticket_id = t.id,
        'customer_name', case when q.ticket_id = t.id then q.customer_name else null end
      ) order by q.position)
      from (
        select waiting.id ticket_id, waiting.display_number,
          row_number() over(order by waiting.ticket_number, waiting.joined_at)::integer position,
          coalesce(waiting.customer_name_override, waiting_customer.name) customer_name
        from public.tickets waiting
        join public.customers waiting_customer on waiting_customer.id = waiting.customer_id
        where waiting.queue_session_id = t.queue_session_id
          and waiting.service_id = t.service_id
          and waiting.status = 'waiting'
      ) q
    ), '[]'::jsonb)
  ) into v_result
  from public.customer_sessions cs
  join public.tickets t on t.customer_session_id = cs.id
  join public.customers c on c.id = t.customer_id
  join public.branches br on br.id = t.branch_id
  join public.businesses b on b.id = br.business_id
  join public.services s on s.id = t.service_id
  join public.queue_configurations qc on qc.branch_id = br.id
  where cs.session_token = target_session_token and cs.expires_at > now()
  order by t.created_at desc limit 1;
  return v_result;
end;
$$;

revoke all on function public.get_public_ticket_status(uuid) from public, service_role;
grant execute on function public.get_public_ticket_status(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
