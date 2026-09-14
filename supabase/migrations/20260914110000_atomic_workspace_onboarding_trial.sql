-- Fix fresh-account onboarding after subscription guardrails were introduced.
--
-- The subscription-limit trigger on business_users previously called
-- get_subscription_access_state() before the new owner membership existed.
-- That authorization check rejected every truly fresh workspace with:
--   "You do not have access to this subscription."
--
-- Bootstrap rules:
-- 1. The very first owner membership may be inserted while the business has no
--    subscription yet.
-- 2. create_initial_business_workspace creates the Starter trial in the SAME
--    database transaction, before branch creation, so the finished workspace is
--    never left unmetered if the application process is interrupted.

create or replace function public.enforce_business_user_subscription_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state text;
  v_limit integer;
  v_count integer;
begin
  -- A brand-new business must be able to create its first owner membership
  -- before its subscription can be attached. RLS still controls ordinary
  -- client inserts; this only prevents the subscription trigger from blocking
  -- the trusted atomic onboarding RPC.
  if not exists (
    select 1
    from public.business_subscriptions bs
    where bs.business_id = new.business_id
  ) then
    return new;
  end if;

  v_state := public.get_subscription_access_state(new.business_id);
  if v_state not in ('active', 'trialing') then
    raise exception 'QueueDrop subscription is %. Renew or activate a plan to add team members.', v_state;
  end if;

  select coalesce(bs.custom_max_users, p.max_users)
  into v_limit
  from public.business_subscriptions bs
  join public.plans p on p.id = bs.plan_id
  where bs.business_id = new.business_id;

  if v_limit is null then
    return new;
  end if;

  select count(*)
  into v_count
  from public.business_users bu
  where bu.business_id = new.business_id
    and bu.id <> coalesce(new.id, gen_random_uuid())
    and coalesce(bu.is_active, true) = true;

  if coalesce(new.is_active, true) = true and v_count >= v_limit then
    raise exception 'Your subscription allows up to % active team member(s).', v_limit;
  end if;

  return new;
end;
$$;

create or replace function public.create_initial_business_workspace(
  business_name text,
  branch_name text,
  branch_address text default null,
  branch_phone text default null
)
returns table (
  business_id uuid,
  branch_id uuid,
  business_slug text,
  branch_slug text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_name text := btrim(business_name);
  v_branch_name text := btrim(branch_name);
  v_address text := nullif(btrim(branch_address), '');
  v_phone text := nullif(btrim(branch_phone), '');
  v_business_id uuid;
  v_branch_id uuid;
  v_business_slug text;
  v_branch_slug text;
  v_base_slug text;
  v_suffix text;
  v_starter_plan_id uuid;
  v_starter_price numeric(12,2);
  v_starter_currency text;
  v_trial_days integer;
  v_started_at timestamptz := now();
  v_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Serialize first-workspace creation for this account so double submits cannot
  -- create two businesses at the same time.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  if exists (
    select 1
    from public.business_users bu
    where bu.user_id = v_user_id
  ) then
    raise exception 'Account already belongs to a business workspace';
  end if;

  if char_length(v_business_name) < 2 or char_length(v_business_name) > 120 then
    raise exception 'Business name must be between 2 and 120 characters';
  end if;

  if char_length(v_branch_name) < 2 or char_length(v_branch_name) > 120 then
    raise exception 'Branch name must be between 2 and 120 characters';
  end if;

  if v_address is not null and char_length(v_address) > 300 then
    raise exception 'Branch address must be 300 characters or fewer';
  end if;

  if v_phone is not null and char_length(v_phone) > 20 then
    raise exception 'Branch phone must be 20 digits or fewer';
  end if;

  if v_phone is not null and v_phone !~ '^[0-9]{7,20}$' then
    raise exception 'Branch phone must contain numbers only';
  end if;

  -- Resolve the commercial bootstrap plan before creating anything. If the
  -- Starter plan is misconfigured, the transaction fails cleanly with no
  -- orphan business or membership.
  select p.id, p.price_monthly, p.currency, p.trial_days
  into v_starter_plan_id, v_starter_price, v_starter_currency, v_trial_days
  from public.plans p
  where p.name = 'Starter'
    and p.is_active = true
    and coalesce(p.accepts_new_subscriptions, true) = true
  limit 1;

  if v_starter_plan_id is null then
    raise exception 'Starter plan is currently unavailable. Please contact QueueDrop support.';
  end if;

  v_trial_days := greatest(coalesce(v_trial_days, 14), 0);
  v_expires_at := v_started_at + make_interval(days => v_trial_days);

  v_base_slug := trim(both '-' from regexp_replace(lower(v_business_name), '[^a-z0-9]+', '-', 'g'));
  if v_base_slug = '' then
    v_base_slug := 'business';
  end if;

  v_business_slug := left(v_base_slug, 48);
  while exists (select 1 from public.businesses b where b.slug = v_business_slug) loop
    v_suffix := left(replace(gen_random_uuid()::text, '-', ''), 6);
    v_business_slug := left(v_base_slug, 41) || '-' || v_suffix;
  end loop;

  v_branch_slug := trim(both '-' from regexp_replace(lower(v_branch_name), '[^a-z0-9]+', '-', 'g'));
  if v_branch_slug = '' then
    v_branch_slug := 'main-branch';
  end if;
  v_branch_slug := left(v_branch_slug, 56);

  insert into public.businesses (name, slug)
  values (v_business_name, v_business_slug)
  returning id into v_business_id;

  -- First membership intentionally comes before the trial. The subscription
  -- limit trigger has a narrow bootstrap exception when no subscription exists.
  insert into public.business_users (business_id, user_id, role)
  values (v_business_id, v_user_id, 'owner');

  insert into public.business_subscriptions (
    business_id,
    plan_id,
    status,
    started_at,
    expires_at,
    billing_price_monthly,
    billing_currency,
    billing_interval,
    renewal_mode,
    updated_at
  )
  values (
    v_business_id,
    v_starter_plan_id,
    'trialing',
    v_started_at,
    v_expires_at,
    v_starter_price,
    coalesce(v_starter_currency, 'PHP'),
    'monthly',
    'manual',
    v_started_at
  );

  insert into public.branches (business_id, name, slug, address, phone)
  values (v_business_id, v_branch_name, v_branch_slug, v_address, v_phone)
  returning id into v_branch_id;

  insert into public.branch_users (branch_id, user_id)
  values (v_branch_id, v_user_id);

  insert into public.queue_configurations (branch_id)
  values (v_branch_id);

  insert into public.audit_logs (
    business_id,
    user_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    v_business_id,
    v_user_id,
    'business.workspace_created',
    'business',
    v_business_id,
    jsonb_build_object(
      'branch_id', v_branch_id,
      'branch_name', v_branch_name,
      'starter_trial_days', v_trial_days,
      'starter_subscription_created', true
    )
  );

  return query
  select v_business_id, v_branch_id, v_business_slug, v_branch_slug;
end;
$$;

revoke all on function public.create_initial_business_workspace(text, text, text, text) from public;
revoke all on function public.create_initial_business_workspace(text, text, text, text) from anon;
grant execute on function public.create_initial_business_workspace(text, text, text, text) to authenticated;
