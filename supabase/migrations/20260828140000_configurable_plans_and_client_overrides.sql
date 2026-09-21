-- QueueDrop configurable SaaS plans, grandfathered pricing, and client-specific overrides.
-- Keeps the existing branch/service model intact while allowing the System Owner
-- to change prices and limits without a code deployment.

alter table public.plans add column if not exists price_yearly numeric(12,2);
alter table public.plans add column if not exists max_active_queues_per_branch integer;
alter table public.plans add column if not exists max_services_per_branch integer;
alter table public.plans add column if not exists trial_days integer not null default 14;
alter table public.plans add column if not exists is_public boolean not null default true;
alter table public.plans add column if not exists accepts_new_subscriptions boolean not null default true;
alter table public.plans add column if not exists feature_flags jsonb not null default '{}'::jsonb;

alter table public.business_subscriptions add column if not exists billing_price_monthly numeric(12,2);
alter table public.business_subscriptions add column if not exists billing_currency text;
alter table public.business_subscriptions add column if not exists custom_monthly_price numeric(12,2);
alter table public.business_subscriptions add column if not exists custom_max_branches integer;
alter table public.business_subscriptions add column if not exists custom_max_active_queues_per_branch integer;
alter table public.business_subscriptions add column if not exists custom_max_services_per_branch integer;
alter table public.business_subscriptions add column if not exists custom_trial_days integer;
alter table public.business_subscriptions add column if not exists override_reason text;
alter table public.business_subscriptions add column if not exists override_expires_at timestamptz;

-- Lock the price that existing subscribers already have. Plan price edits therefore
-- affect new subscriptions only unless the System Owner explicitly applies them.
update public.business_subscriptions bs
set billing_price_monthly = p.price_monthly,
    billing_currency = p.currency
from public.plans p
where p.id = bs.plan_id
  and bs.billing_price_monthly is null;

-- Recommended launch catalog. These are defaults only; every value is editable in /system/plans.
insert into public.plans (
  name, description, min_branches, max_branches, max_users, max_services,
  price_monthly, price_yearly, currency, max_active_queues_per_branch,
  max_services_per_branch, trial_days, is_public, accepts_new_subscriptions,
  sort_order, is_active
)
values
  ('Starter', 'For a single-location business getting started with digital queues.', 1, 1, null, null, 799, 7990, 'PHP', 5, 10, 14, true, true, 10, true),
  ('Growth', 'For growing businesses with up to three locations.', 1, 3, null, null, 1999, 19990, 'PHP', 10, 25, 14, true, true, 20, true),
  ('Business', 'For established businesses with up to five locations.', 1, 5, null, null, 3499, 34990, 'PHP', 15, 50, 14, true, true, 30, true),
  ('Multi-Location', 'For multi-location operations with up to ten locations.', 1, 10, null, null, 5999, 59990, 'PHP', 20, 100, 14, true, true, 40, true),
  ('Enterprise', 'For organizations that need custom limits, pricing, and support.', 11, null, null, null, 7999, null, 'PHP', null, null, 14, true, true, 50, true)
on conflict (name) do update set
  description = excluded.description,
  min_branches = excluded.min_branches,
  max_branches = excluded.max_branches,
  price_monthly = excluded.price_monthly,
  price_yearly = excluded.price_yearly,
  currency = excluded.currency,
  max_active_queues_per_branch = excluded.max_active_queues_per_branch,
  max_services_per_branch = excluded.max_services_per_branch,
  trial_days = excluded.trial_days,
  is_public = excluded.is_public,
  accepts_new_subscriptions = excluded.accepts_new_subscriptions,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

-- Retire the earlier temporary Scale catalog entry if it exists and is unused.
update public.plans set is_active = false, is_public = false, accepts_new_subscriptions = false
where name = 'Scale';

create or replace function public.get_effective_subscription_terms(target_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub public.business_subscriptions%rowtype;
  v_plan public.plans%rowtype;
  v_override_active boolean;
begin
  if auth.uid() is not null
     and not public.is_business_member(target_business_id)
     and not exists (select 1 from public.system_owners so where so.user_id = auth.uid() and so.is_active = true) then
    raise exception 'You do not have access to this subscription.';
  end if;

  select * into v_sub from public.business_subscriptions where business_id = target_business_id limit 1;
  if v_sub.id is null then
    return null;
  end if;

  select * into v_plan from public.plans where id = v_sub.plan_id;
  if v_plan.id is null then return null; end if;

  v_override_active := v_sub.override_expires_at is null or v_sub.override_expires_at > now();

  return jsonb_build_object(
    'subscription_id', v_sub.id,
    'plan_id', v_plan.id,
    'plan_name', v_plan.name,
    'status', v_sub.status,
    'currency', coalesce(v_sub.billing_currency, v_plan.currency, 'PHP'),
    'monthly_price', case
      when v_override_active and v_sub.custom_monthly_price is not null then v_sub.custom_monthly_price
      when v_sub.billing_price_monthly is not null then v_sub.billing_price_monthly
      else v_plan.price_monthly
    end,
    'max_branches', case when v_override_active and v_sub.custom_max_branches is not null then v_sub.custom_max_branches else v_plan.max_branches end,
    'max_active_queues_per_branch', case when v_override_active and v_sub.custom_max_active_queues_per_branch is not null then v_sub.custom_max_active_queues_per_branch else v_plan.max_active_queues_per_branch end,
    'max_services_per_branch', case when v_override_active and v_sub.custom_max_services_per_branch is not null then v_sub.custom_max_services_per_branch else v_plan.max_services_per_branch end,
    'trial_days', case when v_override_active and v_sub.custom_trial_days is not null then v_sub.custom_trial_days else v_plan.trial_days end,
    'override_active', v_override_active,
    'override_reason', case when v_override_active then v_sub.override_reason else null end,
    'override_expires_at', v_sub.override_expires_at
  );
end;
$$;

revoke all on function public.get_effective_subscription_terms(uuid) from public, anon;
grant execute on function public.get_effective_subscription_terms(uuid) to authenticated, service_role;

-- Enforce subscription limits at the database boundary. If a legacy/test business has
-- no subscription, QueueDrop keeps the current behavior and does not block creation.
create or replace function public.enforce_branch_subscription_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_terms jsonb;
  v_limit integer;
  v_count integer;
begin
  v_terms := public.get_effective_subscription_terms(new.business_id);
  if v_terms is null then return new; end if;
  if coalesce(v_terms->>'status','') not in ('active','trialing') then return new; end if;
  if v_terms->>'max_branches' is null then return new; end if;
  v_limit := (v_terms->>'max_branches')::integer;
  if v_limit is null then return new; end if;
  select count(*) into v_count from public.branches where business_id = new.business_id and id <> coalesce(new.id, gen_random_uuid());
  if v_count >= v_limit then
    raise exception 'Your subscription allows up to % branch(es). Upgrade the plan or ask QueueDrop to adjust your client limit.', v_limit;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_branch_subscription_limit on public.branches;
create trigger enforce_branch_subscription_limit
before insert on public.branches
for each row execute function public.enforce_branch_subscription_limit();

create or replace function public.enforce_service_subscription_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_terms jsonb;
  v_total_limit integer;
  v_active_limit integer;
  v_total_count integer;
  v_active_count integer;
begin
  select business_id into v_business_id from public.branches where id = new.branch_id;
  if v_business_id is null then return new; end if;
  v_terms := public.get_effective_subscription_terms(v_business_id);
  if v_terms is null or coalesce(v_terms->>'status','') not in ('active','trialing') then return new; end if;

  if v_terms->>'max_services_per_branch' is not null then
    v_total_limit := (v_terms->>'max_services_per_branch')::integer;
    select count(*) into v_total_count from public.services where branch_id = new.branch_id and id <> coalesce(new.id, gen_random_uuid());
    if tg_op = 'INSERT' and v_total_limit is not null and v_total_count >= v_total_limit then
      raise exception 'Your subscription allows up to % service(s) per branch.', v_total_limit;
    end if;
  end if;

  if coalesce(new.is_active, true) and v_terms->>'max_active_queues_per_branch' is not null then
    v_active_limit := (v_terms->>'max_active_queues_per_branch')::integer;
    select count(*) into v_active_count from public.services
      where branch_id = new.branch_id and is_active = true and id <> coalesce(new.id, gen_random_uuid());
    if v_active_limit is not null and v_active_count >= v_active_limit then
      raise exception 'Your subscription allows up to % active queue(s) per branch.', v_active_limit;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_service_subscription_limit on public.services;
create trigger enforce_service_subscription_limit
before insert or update of is_active, branch_id on public.services
for each row execute function public.enforce_service_subscription_limit();

-- Helpful indexes for system-owner monitoring and billing lookups.
create index if not exists idx_business_subscriptions_plan_status on public.business_subscriptions(plan_id, status);
create index if not exists idx_plans_public_sort on public.plans(is_public, is_active, sort_order);

create table if not exists public.system_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.system_audit_logs enable row level security;

drop policy if exists "System owners can view system audit logs" on public.system_audit_logs;
create policy "System owners can view system audit logs" on public.system_audit_logs
for select to authenticated using (
  exists (select 1 from public.system_owners so where so.user_id = auth.uid() and so.is_active = true)
);
grant select on public.system_audit_logs to authenticated;
create index if not exists idx_system_audit_logs_created_at on public.system_audit_logs(created_at desc);
