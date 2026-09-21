-- QueueDrop: customer portal controls, system-owner console, and subscription/payment foundation.

alter table public.queue_configurations
  add column if not exists customer_refresh_seconds integer not null default 8;

do $$ begin
  alter table public.queue_configurations
    add constraint queue_configurations_customer_refresh_seconds_check
    check (customer_refresh_seconds between 3 and 300);
exception when duplicate_object then null; end $$;

alter table public.customer_sessions
  add column if not exists exit_code text;

update public.customer_sessions
set exit_code = upper(substr(md5(gen_random_uuid()::text), 1, 6))
where exit_code is null;

alter table public.customer_sessions
  alter column exit_code set default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  alter column exit_code set not null;

create table if not exists public.system_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.system_owners enable row level security;

drop policy if exists "System owners can view self" on public.system_owners;
create policy "System owners can view self" on public.system_owners
for select to authenticated using (user_id = auth.uid() and is_active = true);

grant select on public.system_owners to authenticated;

alter table public.plans add column if not exists price_monthly numeric(12,2) not null default 0;
alter table public.plans add column if not exists currency text not null default 'PHP';
alter table public.plans add column if not exists min_branches integer not null default 1;
alter table public.plans add column if not exists sort_order integer not null default 0;

create table if not exists public.subscription_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  requested_by uuid references auth.users(id) on delete set null,
  amount numeric(12,2) not null,
  currency text not null default 'PHP',
  payment_mode text not null default 'online',
  provider text,
  provider_checkout_id text,
  provider_checkout_url text,
  status text not null default 'pending' check (status in ('pending','checkout_created','paid','failed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.subscription_orders enable row level security;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  subscription_order_id uuid references public.subscription_orders(id) on delete set null,
  provider text not null,
  provider_payment_id text,
  provider_reference text,
  amount numeric(12,2) not null,
  currency text not null default 'PHP',
  payment_method text,
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payments enable row level security;

create index if not exists idx_subscription_orders_business on public.subscription_orders(business_id, created_at desc);
create index if not exists idx_payments_business on public.payments(business_id, created_at desc);

-- Business owners/admins can view their own billing records and create checkout orders.
drop policy if exists "Business members can view subscription orders" on public.subscription_orders;
create policy "Business members can view subscription orders" on public.subscription_orders
for select to authenticated using (public.is_business_member(business_id));

drop policy if exists "Business admins can create subscription orders" on public.subscription_orders;
create policy "Business admins can create subscription orders" on public.subscription_orders
for insert to authenticated with check (public.is_business_admin(business_id) and requested_by = auth.uid());

drop policy if exists "Business members can view payments" on public.payments;
create policy "Business members can view payments" on public.payments
for select to authenticated using (public.is_business_member(business_id));

grant select, insert on public.subscription_orders to authenticated;
grant select on public.payments to authenticated;

-- Reasonable starter plans. Existing rows are preserved.
insert into public.plans (name, description, min_branches, max_branches, max_users, max_services, price_monthly, currency, sort_order, is_active)
values
  ('Starter', 'For a single-location business getting started with digital queues.', 1, 1, 10, 20, 799, 'PHP', 10, true),
  ('Growth', 'For growing businesses with up to five locations.', 2, 5, 50, 100, 1999, 'PHP', 20, true),
  ('Scale', 'For multi-location operations with up to twenty locations.', 6, 20, 250, 500, 4999, 'PHP', 30, true)
on conflict (name) do update set
  description = excluded.description,
  min_branches = excluded.min_branches,
  max_branches = excluded.max_branches,
  max_users = excluded.max_users,
  max_services = excluded.max_services,
  price_monthly = excluded.price_monthly,
  currency = excluded.currency,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

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

create or replace function public.leave_public_queue(target_session_token uuid, target_exit_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_ticket public.tickets%rowtype; v_expected text;
begin
  select t.* into v_ticket
  from public.customer_sessions cs
  join public.tickets t on t.customer_session_id = cs.id
  where cs.session_token = target_session_token and cs.expires_at > now()
  order by t.created_at desc limit 1;

  if v_ticket.id is null then raise exception 'Queue ticket is not available'; end if;
  select cs.exit_code into v_expected from public.customer_sessions cs where cs.id = v_ticket.customer_session_id;
  if v_ticket.status not in ('waiting','called') then raise exception 'This ticket can no longer leave the queue'; end if;
  if upper(btrim(coalesce(target_exit_code,''))) <> upper(v_expected) then raise exception 'Exit code is incorrect'; end if;

  update public.tickets set status='cancelled', cancelled_at=now(), updated_at=now() where id=v_ticket.id;
  insert into public.ticket_events(ticket_id,event_type,performed_by,notes)
  values(v_ticket.id,'cancelled',null,'Customer left the queue from public ticket view');
  return public.get_public_ticket_status(target_session_token);
end;
$$;
revoke all on function public.leave_public_queue(uuid,text) from public, service_role;
grant execute on function public.leave_public_queue(uuid,text) to anon, authenticated;

create or replace function public.set_customer_refresh_seconds(target_branch_id uuid, target_seconds integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_business_id uuid; v_role public.user_role; v_allowed boolean := false;
begin
  if target_seconds < 3 or target_seconds > 300 then raise exception 'Refresh interval must be between 3 and 300 seconds'; end if;
  select business_id into v_business_id from public.branches where id=target_branch_id;
  select role into v_role from public.business_users where business_id=v_business_id and user_id=auth.uid() and is_active=true limit 1;
  if v_role in ('owner','admin') then v_allowed := true; end if;
  if v_role='manager' then
    select exists(select 1 from public.branch_users where branch_id=target_branch_id and user_id=auth.uid()) into v_allowed;
  end if;
  if not v_allowed then raise exception 'You do not have permission to change customer refresh settings'; end if;
  update public.queue_configurations set customer_refresh_seconds=target_seconds, updated_at=now() where branch_id=target_branch_id;
end;
$$;
revoke all on function public.set_customer_refresh_seconds(uuid,integer) from public, anon, service_role;
grant execute on function public.set_customer_refresh_seconds(uuid,integer) to authenticated;

do $$ begin
  alter table public.payments add constraint payments_provider_payment_id_key unique (provider_payment_id);
exception when duplicate_object then null; end $$;
