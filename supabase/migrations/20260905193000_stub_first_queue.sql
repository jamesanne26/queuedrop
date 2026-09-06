-- QueueDrop Stub Mode: physical terminal issues an anonymous printed ticket.
-- The QR on the stub opens the private live-status page; mobile is optional.

set local check_function_bodies = off;

alter table public.queue_configurations
  add column if not exists stub_mode_enabled boolean not null default true;

-- Stub-first is the new default experience. Existing branches can explicitly
-- re-enable public web/QR joining later if they need that alternate mode.
update public.queue_configurations
set stub_mode_enabled = true,
    allow_qr_join = false,
    customer_can_edit_name = false,
    customer_can_edit_mobile = true,
    updated_at = now();

alter table public.devices drop constraint if exists devices_device_type_check;
alter table public.devices
  add constraint devices_device_type_check
  check (device_type in ('kiosk','staff','display','ticket_terminal'));

alter table public.devices
  add column if not exists service_id uuid references public.services(id) on delete set null;

alter table public.tickets
  add column if not exists source text not null default 'legacy',
  add column if not exists issued_by_device_id uuid references public.devices(id) on delete set null,
  add column if not exists printed_at timestamptz;

alter table public.tickets drop constraint if exists tickets_source_check;
alter table public.tickets
  add constraint tickets_source_check check (source in ('legacy','web','staff','stub_terminal'));

create index if not exists devices_ticket_terminal_lookup_idx
  on public.devices(device_token, is_active) where device_type = 'ticket_terminal';
create index if not exists tickets_issued_by_device_idx
  on public.tickets(issued_by_device_id, created_at desc);

create or replace function public.get_stub_terminal(target_device_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'device_id', d.id,
    'device_name', d.name,
    'branch_id', br.id,
    'branch_name', br.name,
    'business_name', b.name,
    'service_id', s.id,
    'service_name', s.name,
    'queue_prefix', coalesce(nullif(s.queue_prefix, ''), qc.ticket_prefix, 'Q'),
    'stub_mode_enabled', qc.stub_mode_enabled,
    'queue_active', qc.is_active,
    'branch_open', public.is_branch_open_now(br.id)
  ) into v_result
  from public.devices d
  join public.branches br on br.id = d.branch_id
  join public.businesses b on b.id = br.business_id
  join public.queue_configurations qc on qc.branch_id = br.id
  join public.services s on s.id = d.service_id and s.branch_id = br.id
  where d.device_token = target_device_token
    and d.device_type = 'ticket_terminal'
    and d.is_active = true
    and br.status = 'active'
    and b.status = 'active'
    and s.is_active = true
  limit 1;

  return v_result;
end;
$$;

revoke all on function public.get_stub_terminal(uuid) from public;
grant execute on function public.get_stub_terminal(uuid) to anon, authenticated, service_role;

create or replace function public.issue_stub_ticket(target_device_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_device public.devices%rowtype;
  v_branch public.branches%rowtype;
  v_business public.businesses%rowtype;
  v_service public.services%rowtype;
  v_config public.queue_configurations%rowtype;
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
  v_prefix text;
begin
  select * into v_device
  from public.devices
  where device_token = target_device_token
    and device_type = 'ticket_terminal'
    and is_active = true
  limit 1;

  if v_device.id is null or v_device.service_id is null then
    raise exception 'This QueueDrop terminal is not configured';
  end if;

  select * into v_branch from public.branches where id = v_device.branch_id;
  select * into v_business from public.businesses where id = v_branch.business_id;
  select * into v_service from public.services where id = v_device.service_id and branch_id = v_branch.id;
  select * into v_config from public.queue_configurations where branch_id = v_branch.id;

  if v_business.status <> 'active' or v_branch.status <> 'active' or not coalesce(v_service.is_active, false) then
    raise exception 'This queue is not available';
  end if;
  if not coalesce(v_config.is_active, false) or not coalesce(v_config.stub_mode_enabled, false) then
    raise exception 'Stub issuing is currently disabled';
  end if;
  if not public.is_branch_open_now(v_branch.id) then
    raise exception 'The branch is currently closed';
  end if;

  begin
    v_session_date := (timezone(v_branch.timezone, now()))::date;
  exception when others then
    raise exception 'Branch timezone configuration is invalid';
  end;

  insert into public.queue_sessions (branch_id, session_date, status, opened_at)
  values (v_branch.id, v_session_date, 'open', now())
  on conflict (branch_id, session_date) do nothing;

  select qs.id, qs.status into v_queue_session_id, v_queue_status
  from public.queue_sessions qs
  where qs.branch_id = v_branch.id and qs.session_date = v_session_date
  for update;

  if v_queue_status <> 'open' then raise exception 'The queue is currently closed'; end if;

  -- Anonymous one-ticket customer record keeps existing reporting/status joins
  -- compatible without collecting personal data.
  insert into public.customers (business_id, name, phone)
  values (v_business.id, null, null)
  returning id into v_customer_id;

  insert into public.service_queue_counters (queue_session_id, service_id, current_number)
  values (v_queue_session_id, v_service.id, v_config.starting_number)
  on conflict (queue_session_id, service_id)
  do update set current_number = public.service_queue_counters.current_number + 1, updated_at = now()
  returning current_number into v_ticket_number;

  update public.queue_sessions set current_number = current_number + 1 where id = v_queue_session_id;

  v_prefix := coalesce(nullif(v_service.queue_prefix, ''), nullif(v_config.ticket_prefix, ''), 'Q');
  v_display_number := v_prefix || lpad(v_ticket_number::text, 3, '0');

  insert into public.customer_sessions (customer_id, branch_id, expires_at)
  values (v_customer_id, v_branch.id, now() + interval '24 hours')
  returning id, session_token into v_customer_session_id, v_session_token;

  insert into public.tickets (
    queue_session_id, branch_id, service_id, customer_id, customer_session_id,
    ticket_number, display_number, status, source, issued_by_device_id
  ) values (
    v_queue_session_id, v_branch.id, v_service.id, v_customer_id, v_customer_session_id,
    v_ticket_number, v_display_number, 'waiting', 'stub_terminal', v_device.id
  ) returning id into v_ticket_id;

  insert into public.ticket_events (ticket_id, event_type, performed_by, notes)
  values (v_ticket_id, 'waiting', null, 'Anonymous ticket issued by QueueDrop stub terminal ' || v_device.name);

  update public.devices set last_seen_at = now(), updated_at = now() where id = v_device.id;

  select count(*)::integer into v_position
  from public.tickets t
  where t.queue_session_id = v_queue_session_id
    and t.service_id = v_service.id
    and t.status = 'waiting'
    and t.ticket_number <= v_ticket_number;

  return jsonb_build_object(
    'ticket_id', v_ticket_id,
    'session_token', v_session_token,
    'display_number', v_display_number,
    'position', v_position,
    'status', 'waiting',
    'business_name', v_business.name,
    'branch_name', v_branch.name,
    'service_name', v_service.name
  );
end;
$$;

revoke all on function public.issue_stub_ticket(uuid) from public;
grant execute on function public.issue_stub_ticket(uuid) to anon, authenticated, service_role;

create or replace function public.mark_stub_ticket_printed(
  target_device_token uuid,
  target_ticket_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.tickets t
  set printed_at = now(), updated_at = now()
  from public.devices d
  where d.device_token = target_device_token
    and d.id = t.issued_by_device_id
    and d.device_type = 'ticket_terminal'
    and d.is_active = true
    and t.id = target_ticket_id;
end;
$$;

revoke all on function public.mark_stub_ticket_printed(uuid,uuid) from public;
grant execute on function public.mark_stub_ticket_printed(uuid,uuid) to anon, authenticated, service_role;

-- Stub QR page is phone-opt-in only. Name collection is intentionally disabled.
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
  v_old_phone text;
  v_new_phone text;
begin
  select t.* into v_ticket
  from public.customer_sessions cs
  join public.tickets t on t.customer_session_id = cs.id
  where cs.session_token = target_session_token and cs.expires_at > now()
  order by t.created_at desc limit 1;

  if v_ticket.id is null then raise exception 'Queue ticket is not available'; end if;
  if v_ticket.status not in ('waiting','called') then raise exception 'Mobile notification can no longer be changed for this ticket'; end if;

  select * into v_customer from public.customers where id = v_ticket.customer_id;
  select * into v_config from public.queue_configurations where branch_id = v_ticket.branch_id;

  v_old_phone := coalesce(v_ticket.customer_phone_override, v_customer.phone);
  v_new_phone := nullif(btrim(coalesce(target_phone,'')), '');

  if v_new_phone is distinct from v_old_phone then
    if not v_config.customer_can_edit_mobile then raise exception 'SMS opt-in is disabled'; end if;
    if v_new_phone is null or v_new_phone !~ '^[0-9]{1,20}$' then raise exception 'Mobile number must contain numbers only'; end if;
    update public.tickets set customer_phone_override = v_new_phone where id = v_ticket.id;
    insert into public.ticket_customer_changes(ticket_id, field_name, old_value, new_value, changed_by_type)
    values (v_ticket.id, 'mobile', v_old_phone, v_new_phone, 'customer');
  end if;

  return public.get_public_ticket_status(target_session_token);
end;
$$;

revoke all on function public.update_public_ticket_customer(uuid,text,text) from public;
grant execute on function public.update_public_ticket_customer(uuid,text,text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
