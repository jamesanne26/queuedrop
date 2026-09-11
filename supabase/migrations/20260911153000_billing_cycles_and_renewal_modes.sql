-- QueueDrop billing cycles + client-selected renewal mode.
-- Manual billing continues to use Hosted Checkout (card/GCash).
-- Auto-renew uses PayMongo Subscriptions and is only available when the
-- merchant account has that capability enabled.

alter table public.plans
  add column if not exists allow_auto_renew boolean not null default true;

alter table public.subscription_orders
  add column if not exists billing_interval text not null default 'monthly',
  add column if not exists renewal_mode text not null default 'manual',
  add column if not exists provider_subscription_id text,
  add column if not exists provider_customer_id text,
  add column if not exists provider_plan_id text,
  add column if not exists provider_payment_intent_id text,
  add column if not exists provider_payment_intent_client_key text;

do $$ begin
  alter table public.subscription_orders
    add constraint subscription_orders_billing_interval_check
    check (billing_interval in ('monthly','yearly'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.subscription_orders
    add constraint subscription_orders_renewal_mode_check
    check (renewal_mode in ('manual','auto'));
exception when duplicate_object then null; end $$;

alter table public.business_subscriptions
  add column if not exists billing_interval text not null default 'monthly',
  add column if not exists renewal_mode text not null default 'manual',
  add column if not exists billing_price_yearly numeric(12,2),
  add column if not exists paymongo_subscription_id text,
  add column if not exists paymongo_customer_id text,
  add column if not exists paymongo_plan_id text,
  add column if not exists next_billing_at timestamptz;

do $$ begin
  alter table public.business_subscriptions
    add constraint business_subscriptions_billing_interval_check
    check (billing_interval in ('monthly','yearly'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.business_subscriptions
    add constraint business_subscriptions_renewal_mode_check
    check (renewal_mode in ('manual','auto'));
exception when duplicate_object then null; end $$;

create unique index if not exists idx_business_subscriptions_paymongo_subscription
  on public.business_subscriptions(paymongo_subscription_id)
  where paymongo_subscription_id is not null;

create index if not exists idx_subscription_orders_provider_subscription
  on public.subscription_orders(provider_subscription_id)
  where provider_subscription_id is not null;

-- Existing subscriptions remain manual/monthly. Preserve an annual snapshot
-- when the current plan has an annual price available.
update public.business_subscriptions bs
set billing_price_yearly = p.price_yearly
from public.plans p
where p.id = bs.plan_id
  and bs.billing_price_yearly is null
  and p.price_yearly is not null;

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
  if v_sub.id is null then return null; end if;

  select * into v_plan from public.plans where id = v_sub.plan_id;
  if v_plan.id is null then return null; end if;

  v_override_active := v_sub.override_expires_at is null or v_sub.override_expires_at > now();

  return jsonb_build_object(
    'subscription_id', v_sub.id,
    'plan_id', v_plan.id,
    'plan_name', v_plan.name,
    'status', v_sub.status,
    'currency', coalesce(v_sub.billing_currency, v_plan.currency, 'PHP'),
    'billing_interval', coalesce(v_sub.billing_interval, 'monthly'),
    'renewal_mode', coalesce(v_sub.renewal_mode, 'manual'),
    'next_billing_at', v_sub.next_billing_at,
    'expires_at', v_sub.expires_at,
    'monthly_price', case
      when v_override_active and v_sub.custom_monthly_price is not null then v_sub.custom_monthly_price
      when v_sub.billing_price_monthly is not null then v_sub.billing_price_monthly
      else v_plan.price_monthly
    end,
    'yearly_price', coalesce(v_sub.billing_price_yearly, v_plan.price_yearly),
    'current_cycle_price', case
      when coalesce(v_sub.billing_interval, 'monthly') = 'yearly'
        then coalesce(v_sub.billing_price_yearly, v_plan.price_yearly)
      when v_override_active and v_sub.custom_monthly_price is not null
        then v_sub.custom_monthly_price
      when v_sub.billing_price_monthly is not null
        then v_sub.billing_price_monthly
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
