set local check_function_bodies = off;

-- Mobile numbers are digits-only across QueueDrop. Country-code format is not required.
create or replace function public.join_public_queue_unchecked(
  target_business_slug text,
  target_branch_slug text,
  target_service_id uuid,
  customer_name text,
  customer_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := btrim(customer_name);
  v_phone text := btrim(customer_phone);
  v_business_id uuid;
  v_business_name text;
  v_branch_id uuid;
  v_branch_name text;
  v_branch_timezone text;
  v_service_name text;
  v_service_prefix text;
  v_starting_number integer;
  v_session_date date;
  v_queue_session_id uuid;
  v_queue_status text;
  v_customer_id uuid;
  v_customer_session_id uuid;
  v_session_token uuid;
  v_ticket_number integer;
  v_display_number text;
  v_ticket_id uuid;
  v_position integer;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 100 then
    raise exception 'Customer name must be between 1 and 100 characters';
  end if;
  if v_name ~ '[<>{}\[\]]' then
    raise exception 'Customer name contains unsupported characters';
  end if;
  if v_phone !~ '^[0-9]{1,20}$' then
    raise exception 'Mobile number must contain numbers only';
  end if;

  select
    b.id,
    b.name,
    br.id,
    br.name,
    br.timezone,
    s.name,
    coalesce(s.queue_prefix, qc.ticket_prefix),
    qc.starting_number
  into
    v_business_id,
    v_business_name,
    v_branch_id,
    v_branch_name,
    v_branch_timezone,
    v_service_name,
    v_service_prefix,
    v_starting_number
  from public.businesses b
  join public.branches br on br.business_id = b.id
  join public.queue_configurations qc on qc.branch_id = br.id
  join public.services s on s.branch_id = br.id
  where b.slug = lower(btrim(target_business_slug))
    and br.slug = lower(btrim(target_branch_slug))
    and s.id = target_service_id
    and b.status = 'active'
    and br.status = 'active'
    and s.is_active = true
    and qc.is_active = true
    and qc.allow_qr_join = true
  limit 1;

  if v_branch_id is null then
    raise exception 'This queue is not available';
  end if;

  begin
    v_session_date := (timezone(v_branch_timezone, now()))::date;
  exception when others then
    raise exception 'Branch timezone configuration is invalid';
  end;

  insert into public.queue_sessions (branch_id, session_date, status, opened_at)
  values (v_branch_id, v_session_date, 'open', now())
  on conflict (branch_id, session_date) do nothing;

  select qs.id, qs.status
  into v_queue_session_id, v_queue_status
  from public.queue_sessions qs
  where qs.branch_id = v_branch_id
    and qs.session_date = v_session_date
  for update;

  if v_queue_status <> 'open' then
    raise exception 'The queue is currently closed';
  end if;

  select c.id
  into v_customer_id
  from public.customers c
  where c.business_id = v_business_id
    and c.phone = v_phone
  order by c.created_at
  limit 1;

  if v_customer_id is null then
    insert into public.customers (business_id, phone, name)
    values (v_business_id, v_phone, v_name)
    returning id into v_customer_id;
  else
    update public.customers
    set name = v_name
    where id = v_customer_id;
  end if;

  if exists (
    select 1
    from public.tickets t
    where t.queue_session_id = v_queue_session_id
      and t.service_id = target_service_id
      and t.customer_id = v_customer_id
      and t.status in ('waiting', 'called', 'serving')
  ) then
    raise exception 'This mobile number already has an active ticket for this service';
  end if;

  insert into public.service_queue_counters (queue_session_id, service_id, current_number)
  values (v_queue_session_id, target_service_id, v_starting_number)
  on conflict (queue_session_id, service_id)
  do update set
    current_number = public.service_queue_counters.current_number + 1,
    updated_at = now()
  returning current_number into v_ticket_number;

  update public.queue_sessions
  set current_number = current_number + 1
  where id = v_queue_session_id;

  v_display_number := coalesce(nullif(v_service_prefix, ''), 'Q') || lpad(v_ticket_number::text, 3, '0');

  insert into public.customer_sessions (customer_id, branch_id, expires_at)
  values (v_customer_id, v_branch_id, now() + interval '24 hours')
  returning id, session_token into v_customer_session_id, v_session_token;

  insert into public.tickets (
    queue_session_id,
    branch_id,
    service_id,
    customer_id,
    customer_session_id,
    ticket_number,
    display_number,
    status
  )
  values (
    v_queue_session_id,
    v_branch_id,
    target_service_id,
    v_customer_id,
    v_customer_session_id,
    v_ticket_number,
    v_display_number,
    'waiting'
  )
  returning id into v_ticket_id;

  insert into public.ticket_events (ticket_id, event_type, performed_by, notes)
  values (v_ticket_id, 'waiting', null, 'Customer joined public queue');

  select count(*)::integer
  into v_position
  from public.tickets t
  where t.queue_session_id = v_queue_session_id
    and t.service_id = target_service_id
    and t.status = 'waiting'
    and t.ticket_number <= v_ticket_number;

  return jsonb_build_object(
    'ticket_id', v_ticket_id,
    'session_token', v_session_token,
    'display_number', v_display_number,
    'position', v_position,
    'status', 'waiting',
    'customer_name', v_name,
    'customer_phone', v_phone,
    'business_name', v_business_name,
    'branch_name', v_branch_name,
    'service_name', v_service_name
  );
end;
$$;



revoke all on function public.join_public_queue_unchecked(text, text, uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.update_public_ticket_customer(
  target_session_token uuid,
  target_name text default null,
  target_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket public.tickets%rowtype;
  v_customer public.customers%rowtype;
  v_config public.queue_configurations%rowtype;
  v_old_name text;
  v_old_phone text;
  v_new_name text;
  v_new_phone text;
begin
  select t.* into v_ticket
  from public.customer_sessions cs
  join public.tickets t on t.customer_session_id = cs.id
  where cs.session_token = target_session_token
    and cs.expires_at > now()
  order by t.created_at desc limit 1;

  if v_ticket.id is null then raise exception 'Queue ticket is not available'; end if;
  if v_ticket.status not in ('waiting','called') then raise exception 'Customer details can no longer be edited for this ticket'; end if;

  select * into v_customer from public.customers where id = v_ticket.customer_id;
  select * into v_config from public.queue_configurations where branch_id = v_ticket.branch_id;

  v_old_name := coalesce(v_ticket.customer_name_override, v_customer.name);
  v_old_phone := coalesce(v_ticket.customer_phone_override, v_customer.phone);
  v_new_name := nullif(btrim(target_name), '');
  v_new_phone := nullif(btrim(coalesce(target_phone,'')), '');

  if v_new_name is distinct from v_old_name then
    if not v_config.customer_can_edit_name then raise exception 'Customer name editing is disabled'; end if;
    if v_new_name is null or length(v_new_name) < 1 or length(v_new_name) > 100 or v_new_name ~ '[<>{}\[\]]' then raise exception 'Invalid customer name'; end if;
    update public.tickets set customer_name_override = v_new_name where id = v_ticket.id;
    insert into public.ticket_customer_changes(ticket_id, field_name, old_value, new_value, changed_by_type)
      values (v_ticket.id, 'name', v_old_name, v_new_name, 'customer');
  end if;

  if v_new_phone is distinct from v_old_phone then
    if not v_config.customer_can_edit_mobile then raise exception 'Customer mobile editing is disabled'; end if;
    if v_new_phone is null or v_new_phone !~ '^[0-9]{1,20}$' then raise exception 'Mobile number must contain numbers only'; end if;
    update public.tickets set customer_phone_override = v_new_phone where id = v_ticket.id;
    insert into public.ticket_customer_changes(ticket_id, field_name, old_value, new_value, changed_by_type)
      values (v_ticket.id, 'mobile', v_old_phone, v_new_phone, 'customer');
  end if;

  return public.get_public_ticket_status(target_session_token);
end;
$$;


revoke all on function public.update_public_ticket_customer(uuid,text,text)
  from public, service_role;
grant execute on function public.update_public_ticket_customer(uuid,text,text)
  to anon, authenticated;

create or replace function public.update_ticket_customer_by_operator(
  target_ticket_id uuid,
  target_name text default null,
  target_phone text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket public.tickets%rowtype;
  v_customer public.customers%rowtype;
  v_config public.queue_configurations%rowtype;
  v_role public.user_role;
  v_old_name text;
  v_old_phone text;
  v_new_name text;
  v_new_phone text;
  v_can_name boolean;
  v_can_mobile boolean;
begin
  select * into v_ticket from public.tickets where id = target_ticket_id;
  if v_ticket.id is null or not public.can_operate_branch(v_ticket.branch_id) then raise exception 'Ticket is not available'; end if;
  if v_ticket.status not in ('waiting','called','serving') then raise exception 'Ticket details can no longer be edited'; end if;

  select bu.role into v_role
  from public.business_users bu
  join public.branches b on b.business_id = bu.business_id
  where b.id = v_ticket.branch_id
    and bu.user_id = auth.uid()
    and bu.is_active = true
  limit 1;

  select * into v_customer from public.customers where id = v_ticket.customer_id;
  select * into v_config from public.queue_configurations where branch_id = v_ticket.branch_id;

  v_can_name := case when v_role in ('owner','admin') then true when v_role = 'manager' then v_config.manager_can_edit_name else v_config.staff_can_edit_name end;
  v_can_mobile := case when v_role in ('owner','admin') then true when v_role = 'manager' then v_config.manager_can_edit_mobile else v_config.staff_can_edit_mobile end;
  v_old_name := coalesce(v_ticket.customer_name_override, v_customer.name);
  v_old_phone := coalesce(v_ticket.customer_phone_override, v_customer.phone);
  v_new_name := nullif(btrim(target_name), '');
  v_new_phone := nullif(btrim(coalesce(target_phone,'')), '');

  if v_new_name is distinct from v_old_name then
    if not v_can_name then raise exception 'Your role cannot edit customer names for this branch'; end if;
    if v_new_name is null or length(v_new_name) < 1 or length(v_new_name) > 100 or v_new_name ~ '[<>{}\[\]]' then raise exception 'Invalid customer name'; end if;
    update public.tickets set customer_name_override = v_new_name where id = target_ticket_id;
    insert into public.ticket_customer_changes(ticket_id, field_name, old_value, new_value, changed_by_type, changed_by_user_id)
      values (target_ticket_id, 'name', v_old_name, v_new_name, v_role::text, auth.uid());
  end if;

  if v_new_phone is distinct from v_old_phone then
    if not v_can_mobile then raise exception 'Your role cannot edit customer mobile numbers for this branch'; end if;
    if v_new_phone is null or v_new_phone !~ '^[0-9]{1,20}$' then raise exception 'Mobile number must contain numbers only'; end if;
    update public.tickets set customer_phone_override = v_new_phone where id = target_ticket_id;
    insert into public.ticket_customer_changes(ticket_id, field_name, old_value, new_value, changed_by_type, changed_by_user_id)
      values (target_ticket_id, 'mobile', v_old_phone, v_new_phone, v_role::text, auth.uid());
  end if;
end;
$$;


revoke all on function public.update_ticket_customer_by_operator(uuid,text,text)
  from public, anon, service_role;
grant execute on function public.update_ticket_customer_by_operator(uuid,text,text)
  to authenticated;
