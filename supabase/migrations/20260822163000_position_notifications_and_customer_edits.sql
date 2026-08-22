set local check_function_bodies = off;

-- Milestone 7.1: branch-level position notification rules and queue-data edit permissions.
alter table public.queue_configurations
  add column if not exists customer_can_edit_name boolean not null default false,
  add column if not exists customer_can_edit_mobile boolean not null default false,
  add column if not exists staff_can_edit_name boolean not null default true,
  add column if not exists staff_can_edit_mobile boolean not null default true,
  add column if not exists manager_can_edit_name boolean not null default true,
  add column if not exists manager_can_edit_mobile boolean not null default true;

create table if not exists public.position_notification_rules (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  position integer not null check (position >= 1 and position <= 9999),
  send_sms_once boolean not null default false,
  browser_notification boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint position_notification_rules_branch_position_key unique (branch_id, position)
);

alter table public.position_notification_rules enable row level security;

create index if not exists idx_position_notification_rules_branch
  on public.position_notification_rules(branch_id, position);

drop trigger if exists set_position_notification_rules_updated_at on public.position_notification_rules;
create trigger set_position_notification_rules_updated_at
  before update on public.position_notification_rules
  for each row execute function public.set_updated_at();

create policy "Scoped members can view position notification rules"
  on public.position_notification_rules
  for select to authenticated
  using (
    exists (
      select 1 from public.branches b
      where b.id = position_notification_rules.branch_id
        and (public.is_business_admin(b.business_id) or public.is_branch_member(b.id))
    )
  );

grant select on public.position_notification_rules to authenticated;
grant all on public.position_notification_rules to postgres, service_role;

-- Ticket-specific overrides keep queue edits from rewriting the customer's master profile/history.
alter table public.tickets
  add column if not exists customer_name_override text,
  add column if not exists customer_phone_override text;

create table if not exists public.ticket_customer_changes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  field_name text not null check (field_name in ('name', 'mobile')),
  old_value text,
  new_value text,
  changed_by_type text not null check (changed_by_type in ('customer', 'staff', 'manager', 'admin', 'owner')),
  changed_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.ticket_customer_changes enable row level security;
create index if not exists idx_ticket_customer_changes_ticket_created
  on public.ticket_customer_changes(ticket_id, created_at desc);

create policy "Queue operators can view ticket customer changes"
  on public.ticket_customer_changes
  for select to authenticated
  using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_customer_changes.ticket_id
        and public.can_operate_branch(t.branch_id)
    )
  );

grant select on public.ticket_customer_changes to authenticated;
grant all on public.ticket_customer_changes to postgres, service_role;

-- Owner/admin can configure all business branches. Manager can configure only assigned branches.
create or replace function public.can_manage_branch_settings(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.branches b
    where b.id = target_branch_id
      and (
        public.is_business_admin(b.business_id)
        or exists (
          select 1
          from public.business_users bu
          join public.branch_users bru
            on bru.user_id = bu.user_id
           and bru.branch_id = b.id
          where bu.business_id = b.business_id
            and bu.user_id = auth.uid()
            and bu.is_active = true
            and bu.role = 'manager'
        )
      )
  );
$$;

revoke all on function public.can_manage_branch_settings(uuid) from public, anon, service_role;
grant execute on function public.can_manage_branch_settings(uuid) to authenticated;

create or replace function public.save_branch_queue_settings(
  target_branch_id uuid,
  target_ticket_prefix text,
  target_starting_number integer,
  target_no_show_minutes integer,
  target_timezone text,
  target_allow_qr_join boolean,
  target_is_active boolean,
  target_show_branch_contact boolean,
  target_customer_can_edit_name boolean,
  target_customer_can_edit_mobile boolean,
  target_staff_can_edit_name boolean,
  target_staff_can_edit_mobile boolean,
  target_manager_can_edit_name boolean,
  target_manager_can_edit_mobile boolean,
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

  select b.business_id into v_business_id from public.branches b where b.id = target_branch_id;
  select bu.role into v_role
  from public.business_users bu
  where bu.business_id = v_business_id
    and bu.user_id = auth.uid()
    and bu.is_active = true
  limit 1;

  if target_ticket_prefix !~ '^[A-Z0-9]{1,6}$' then raise exception 'Invalid queue prefix'; end if;
  if target_starting_number < 1 or target_starting_number > 999999 then raise exception 'Invalid starting number'; end if;
  if target_no_show_minutes < 0 or target_no_show_minutes > 1440 then raise exception 'Invalid no-show minutes'; end if;

  update public.branches set timezone = target_timezone where id = target_branch_id;

  insert into public.queue_configurations (
    branch_id, ticket_prefix, starting_number, no_show_minutes,
    allow_qr_join, is_active, show_branch_contact,
    customer_can_edit_name, customer_can_edit_mobile,
    staff_can_edit_name, staff_can_edit_mobile,
    manager_can_edit_name, manager_can_edit_mobile
  ) values (
    target_branch_id, target_ticket_prefix, target_starting_number, target_no_show_minutes,
    target_allow_qr_join, target_is_active, target_show_branch_contact,
    target_customer_can_edit_name, target_customer_can_edit_mobile,
    target_staff_can_edit_name, target_staff_can_edit_mobile,
    target_manager_can_edit_name, target_manager_can_edit_mobile
  )
  on conflict (branch_id) do update set
    ticket_prefix = excluded.ticket_prefix,
    starting_number = excluded.starting_number,
    no_show_minutes = excluded.no_show_minutes,
    allow_qr_join = excluded.allow_qr_join,
    is_active = excluded.is_active,
    show_branch_contact = excluded.show_branch_contact,
    customer_can_edit_name = excluded.customer_can_edit_name,
    customer_can_edit_mobile = excluded.customer_can_edit_mobile,
    staff_can_edit_name = excluded.staff_can_edit_name,
    staff_can_edit_mobile = excluded.staff_can_edit_mobile,
    manager_can_edit_name = excluded.manager_can_edit_name,
    manager_can_edit_mobile = excluded.manager_can_edit_mobile,
    updated_at = now();

  delete from public.operating_hours where branch_id = target_branch_id;
  for v_hour in select value from jsonb_array_elements(coalesce(target_hours, '[]'::jsonb)) loop
    insert into public.operating_hours(branch_id, day_of_week, is_open, open_time, close_time)
    values (
      target_branch_id,
      (v_hour->>'day_of_week')::smallint,
      coalesce((v_hour->>'is_open')::boolean, false),
      case when coalesce((v_hour->>'is_open')::boolean, false) then (v_hour->>'open_time')::time else null end,
      case when coalesce((v_hour->>'is_open')::boolean, false) then (v_hour->>'close_time')::time else null end
    );
  end loop;

  delete from public.position_notification_rules where branch_id = target_branch_id;
  for v_rule in select value from jsonb_array_elements(coalesce(target_position_rules, '[]'::jsonb)) loop
    if (v_rule->>'position')::integer < 1 then raise exception 'Notification position must be at least 1'; end if;
    insert into public.position_notification_rules(branch_id, position, send_sms_once, browser_notification)
    values (
      target_branch_id,
      (v_rule->>'position')::integer,
      coalesce((v_rule->>'send_sms_once')::boolean, false),
      coalesce((v_rule->>'browser_notification')::boolean, false)
    );
  end loop;

  insert into public.audit_logs(business_id, user_id, action, entity_type, entity_id, details)
  values (
    v_business_id,
    auth.uid(),
    'queue.settings_updated',
    'branch',
    target_branch_id,
    jsonb_build_object('role', v_role, 'position_rules', target_position_rules)
  );
end;
$$;

revoke all on function public.save_branch_queue_settings(uuid,text,integer,integer,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,jsonb,jsonb)
  from public, anon, service_role;
grant execute on function public.save_branch_queue_settings(uuid,text,integer,integer,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,jsonb,jsonb)
  to authenticated;

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
  v_new_phone := nullif(regexp_replace(coalesce(target_phone,''), '[[:space:]-]', '', 'g'), '');

  if v_new_name is distinct from v_old_name then
    if not v_config.customer_can_edit_name then raise exception 'Customer name editing is disabled'; end if;
    if v_new_name is null or length(v_new_name) < 1 or length(v_new_name) > 100 or v_new_name ~ '[<>{}\[\]]' then raise exception 'Invalid customer name'; end if;
    update public.tickets set customer_name_override = v_new_name where id = v_ticket.id;
    insert into public.ticket_customer_changes(ticket_id, field_name, old_value, new_value, changed_by_type)
      values (v_ticket.id, 'name', v_old_name, v_new_name, 'customer');
  end if;

  if v_new_phone is distinct from v_old_phone then
    if not v_config.customer_can_edit_mobile then raise exception 'Customer mobile editing is disabled'; end if;
    if v_new_phone is null or v_new_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Use a valid mobile number with country code'; end if;
    update public.tickets set customer_phone_override = v_new_phone where id = v_ticket.id;
    insert into public.ticket_customer_changes(ticket_id, field_name, old_value, new_value, changed_by_type)
      values (v_ticket.id, 'mobile', v_old_phone, v_new_phone, 'customer');
  end if;

  return public.get_public_ticket_status(target_session_token);
end;
$$;

revoke all on function public.update_public_ticket_customer(uuid,text,text) from public, service_role;
grant execute on function public.update_public_ticket_customer(uuid,text,text) to anon, authenticated;

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
  v_new_phone := nullif(regexp_replace(coalesce(target_phone,''), '[[:space:]-]', '', 'g'), '');

  if v_new_name is distinct from v_old_name then
    if not v_can_name then raise exception 'Your role cannot edit customer names for this branch'; end if;
    if v_new_name is null or length(v_new_name) < 1 or length(v_new_name) > 100 or v_new_name ~ '[<>{}\[\]]' then raise exception 'Invalid customer name'; end if;
    update public.tickets set customer_name_override = v_new_name where id = target_ticket_id;
    insert into public.ticket_customer_changes(ticket_id, field_name, old_value, new_value, changed_by_type, changed_by_user_id)
      values (target_ticket_id, 'name', v_old_name, v_new_name, v_role::text, auth.uid());
  end if;

  if v_new_phone is distinct from v_old_phone then
    if not v_can_mobile then raise exception 'Your role cannot edit customer mobile numbers for this branch'; end if;
    if v_new_phone is null or v_new_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Use a valid mobile number with country code'; end if;
    update public.tickets set customer_phone_override = v_new_phone where id = target_ticket_id;
    insert into public.ticket_customer_changes(ticket_id, field_name, old_value, new_value, changed_by_type, changed_by_user_id)
      values (target_ticket_id, 'mobile', v_old_phone, v_new_phone, v_role::text, auth.uid());
  end if;
end;
$$;

revoke all on function public.update_ticket_customer_by_operator(uuid,text,text) from public, anon, service_role;
grant execute on function public.update_ticket_customer_by_operator(uuid,text,text) to authenticated;

-- Public status uses ticket-specific edited values and exposes edit permissions for the private token holder.
create or replace function public.get_public_ticket_status(target_session_token uuid)
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
    'business_name', b.name,
    'branch_name', br.name,
    'branch_phone', case when qc.show_branch_contact then br.phone else null end,
    'service_name', s.name,
    'joined_at', t.joined_at,
    'called_at', t.called_at,
    'serving_at', t.serving_at,
    'completed_at', t.completed_at
  ) into v_result
  from public.customer_sessions cs
  join public.tickets t on t.customer_session_id = cs.id
  join public.customers c on c.id = t.customer_id
  join public.branches br on br.id = t.branch_id
  join public.businesses b on b.id = br.business_id
  join public.services s on s.id = t.service_id
  join public.queue_configurations qc on qc.branch_id = br.id
  where cs.session_token = target_session_token
    and cs.expires_at > now()
  order by t.created_at desc limit 1;
  return v_result;
end;
$$;

revoke all on function public.get_public_ticket_status(uuid) from public, service_role;
grant execute on function public.get_public_ticket_status(uuid) to anon, authenticated;
