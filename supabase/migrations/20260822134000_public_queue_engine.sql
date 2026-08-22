set local check_function_bodies = off;

alter table public.branches
  add column if not exists timezone text not null default 'Asia/Manila';

alter table public.queue_configurations
  add column if not exists show_branch_contact boolean not null default true;

create table if not exists public.service_queue_counters (
  queue_session_id uuid not null references public.queue_sessions(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  current_number integer not null,
  updated_at timestamp with time zone not null default now(),
  constraint service_queue_counters_pkey primary key (queue_session_id, service_id),
  constraint service_queue_counters_current_number_check check (current_number > 0)
);

alter table public.service_queue_counters enable row level security;

create policy "Branch members can view service queue counters"
on public.service_queue_counters
for select
to authenticated
using (
  exists (
    select 1
    from public.queue_sessions qs
    where qs.id = service_queue_counters.queue_session_id
      and public.is_branch_member(qs.branch_id)
  )
);

alter table public.tickets
  drop constraint if exists tickets_queue_session_id_ticket_number_key;

create unique index if not exists tickets_queue_session_service_ticket_number_key
  on public.tickets(queue_session_id, service_id, ticket_number);

create index if not exists idx_tickets_service_status_joined
  on public.tickets(service_id, status, joined_at);

create index if not exists idx_tickets_queue_service_status_number
  on public.tickets(queue_session_id, service_id, status, ticket_number);

create or replace function public.get_public_branch_queue(
  target_business_slug text,
  target_branch_slug text
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
    'business', jsonb_build_object(
      'name', b.name,
      'slug', b.slug
    ),
    'branch', jsonb_build_object(
      'id', br.id,
      'name', br.name,
      'slug', br.slug,
      'address', br.address,
      'phone', case when qc.show_branch_contact then br.phone else null end,
      'timezone', br.timezone
    ),
    'services', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'description', s.description,
          'queue_prefix', coalesce(s.queue_prefix, qc.ticket_prefix),
          'estimated_minutes', s.estimated_minutes
        ) order by s.created_at
      )
      from public.services s
      where s.branch_id = br.id
        and s.is_active = true
    ), '[]'::jsonb)
  )
  into v_result
  from public.businesses b
  join public.branches br on br.business_id = b.id
  join public.queue_configurations qc on qc.branch_id = br.id
  where b.slug = lower(btrim(target_business_slug))
    and br.slug = lower(btrim(target_branch_slug))
    and b.status = 'active'
    and br.status = 'active'
    and qc.is_active = true
    and qc.allow_qr_join = true
  limit 1;

  return v_result;
end;
$$;

create or replace function public.join_public_queue(
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
  v_phone text := regexp_replace(btrim(customer_phone), '[[:space:]-]', '', 'g');
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
  if v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Mobile number must include country code, for example +639171234567';
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
    'customer_name', c.name,
    'customer_phone', c.phone,
    'business_name', b.name,
    'branch_name', br.name,
    'branch_phone', case when qc.show_branch_contact then br.phone else null end,
    'service_name', s.name,
    'joined_at', t.joined_at,
    'called_at', t.called_at,
    'serving_at', t.serving_at,
    'completed_at', t.completed_at
  )
  into v_result
  from public.customer_sessions cs
  join public.tickets t on t.customer_session_id = cs.id
  join public.customers c on c.id = t.customer_id
  join public.branches br on br.id = t.branch_id
  join public.businesses b on b.id = br.business_id
  join public.services s on s.id = t.service_id
  join public.queue_configurations qc on qc.branch_id = br.id
  where cs.session_token = target_session_token
    and cs.expires_at > now()
  order by t.created_at desc
  limit 1;

  return v_result;
end;
$$;

revoke all on function public.get_public_branch_queue(text, text) from public, service_role;
revoke all on function public.join_public_queue(text, text, uuid, text, text) from public, service_role;
revoke all on function public.get_public_ticket_status(uuid) from public, service_role;
grant execute on function public.get_public_branch_queue(text, text) to anon, authenticated;
grant execute on function public.join_public_queue(text, text, uuid, text, text) to anon, authenticated;
grant execute on function public.get_public_ticket_status(uuid) to anon, authenticated;
