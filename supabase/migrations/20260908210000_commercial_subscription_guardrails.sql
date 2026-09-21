-- QueueDrop commercial subscription guardrails.
-- Expiry is enforced from expires_at even if a scheduled lifecycle job has not run yet.

create or replace function public.get_subscription_access_state(target_business_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_status text; v_expires_at timestamptz;
begin
  if auth.uid() is not null
     and not public.is_business_member(target_business_id)
     and not exists (select 1 from public.system_owners so where so.user_id = auth.uid() and so.is_active = true) then
    raise exception 'You do not have access to this subscription.';
  end if;
  select status, expires_at into v_status, v_expires_at from public.business_subscriptions where business_id = target_business_id limit 1;
  if v_status is null then return 'none'; end if;
  if v_expires_at is not null and v_expires_at <= now() and v_status in ('active','trialing','past_due') then return 'expired'; end if;
  return v_status;
end;
$$;
revoke all on function public.get_subscription_access_state(uuid) from public, anon;
grant execute on function public.get_subscription_access_state(uuid) to authenticated, service_role;

create or replace function public.require_subscription_write_access(target_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_state text;
begin
  select public.get_subscription_access_state(target_business_id) into v_state;
  -- Legacy/test workspaces without a subscription remain compatible. New self-service workspaces get a trial at onboarding.
  if v_state = 'none' then return; end if;
  if v_state not in ('active','trialing') then
    raise exception 'QueueDrop subscription is %. Renew or activate a plan to make changes.', v_state;
  end if;
end;
$$;
revoke all on function public.require_subscription_write_access(uuid) from public, anon;
grant execute on function public.require_subscription_write_access(uuid) to authenticated, service_role;

create or replace function public.enforce_branch_subscription_limit()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_terms jsonb; v_limit integer; v_count integer;
begin
  perform public.require_subscription_write_access(new.business_id);
  v_terms := public.get_effective_subscription_terms(new.business_id);
  if v_terms is null or v_terms->>'max_branches' is null then return new; end if;
  v_limit := (v_terms->>'max_branches')::integer;
  select count(*) into v_count from public.branches where business_id = new.business_id and id <> coalesce(new.id, gen_random_uuid());
  if v_count >= v_limit then raise exception 'Your subscription allows up to % branch(es). Upgrade your plan to add another branch.', v_limit; end if;
  return new;
end; $$;

drop trigger if exists enforce_branch_subscription_limit on public.branches;
create trigger enforce_branch_subscription_limit before insert on public.branches for each row execute function public.enforce_branch_subscription_limit();

create or replace function public.enforce_service_subscription_limit()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_business_id uuid; v_terms jsonb; v_total_limit integer; v_active_limit integer; v_total_count integer; v_active_count integer;
begin
  select business_id into v_business_id from public.branches where id = new.branch_id;
  if v_business_id is null then return new; end if;
  perform public.require_subscription_write_access(v_business_id);
  v_terms := public.get_effective_subscription_terms(v_business_id);
  if v_terms is null then return new; end if;
  if v_terms->>'max_services_per_branch' is not null then
    v_total_limit := (v_terms->>'max_services_per_branch')::integer;
    select count(*) into v_total_count from public.services where branch_id = new.branch_id and id <> coalesce(new.id, gen_random_uuid());
    if tg_op = 'INSERT' and v_total_count >= v_total_limit then raise exception 'Your subscription allows up to % service(s) per branch.', v_total_limit; end if;
  end if;
  if coalesce(new.is_active,true) and v_terms->>'max_active_queues_per_branch' is not null then
    v_active_limit := (v_terms->>'max_active_queues_per_branch')::integer;
    select count(*) into v_active_count from public.services where branch_id = new.branch_id and is_active = true and id <> coalesce(new.id, gen_random_uuid());
    if v_active_count >= v_active_limit then raise exception 'Your subscription allows up to % active queue(s) per branch.', v_active_limit; end if;
  end if;
  return new;
end; $$;

drop trigger if exists enforce_service_subscription_limit on public.services;
create trigger enforce_service_subscription_limit before insert or update of is_active, branch_id on public.services for each row execute function public.enforce_service_subscription_limit();

-- Idempotent lifecycle reconciliation, safe to call from a scheduler/cron later.
create or replace function public.reconcile_subscription_lifecycle()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  update public.business_subscriptions set status='expired', updated_at=now()
  where status in ('active','trialing','past_due') and expires_at is not null and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end; $$;
revoke all on function public.reconcile_subscription_lifecycle() from public, anon, authenticated;
grant execute on function public.reconcile_subscription_lifecycle() to service_role;

create index if not exists idx_business_subscriptions_expiry on public.business_subscriptions(status, expires_at);

-- Commercial limits for staff accounts and ticket terminals.
alter table public.plans add column if not exists max_terminals integer;
alter table public.business_subscriptions add column if not exists custom_max_users integer;
alter table public.business_subscriptions add column if not exists custom_max_terminals integer;
update public.plans set max_users = coalesce(max_users, 5), max_terminals = coalesce(max_terminals, 2) where name='Starter';
update public.plans set max_users = coalesce(max_users, 15), max_terminals = coalesce(max_terminals, 10) where name='Growth';
update public.plans set max_users = coalesce(max_users, 30), max_terminals = coalesce(max_terminals, 25) where name='Business';
update public.plans set max_users = coalesce(max_users, 75), max_terminals = coalesce(max_terminals, 60) where name='Multi-Location';

create or replace function public.enforce_business_user_subscription_limit()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_state text; v_limit integer; v_count integer;
begin
  v_state := public.get_subscription_access_state(new.business_id);
  if v_state = 'none' then return new; end if;
  if v_state not in ('active','trialing') then raise exception 'QueueDrop subscription is %. Renew or activate a plan to add team members.', v_state; end if;
  select coalesce(bs.custom_max_users,p.max_users) into v_limit from public.business_subscriptions bs join public.plans p on p.id=bs.plan_id where bs.business_id=new.business_id;
  if v_limit is null then return new; end if;
  select count(*) into v_count from public.business_users where business_id=new.business_id and id <> coalesce(new.id,gen_random_uuid()) and coalesce(is_active,true)=true;
  if coalesce(new.is_active,true)=true and v_count >= v_limit then raise exception 'Your subscription allows up to % active team member(s).',v_limit; end if;
  return new;
end; $$;
drop trigger if exists enforce_business_user_subscription_limit on public.business_users;
create trigger enforce_business_user_subscription_limit before insert or update of is_active on public.business_users for each row execute function public.enforce_business_user_subscription_limit();

create or replace function public.enforce_terminal_subscription_limit()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_business_id uuid; v_state text; v_limit integer; v_count integer;
begin
  select business_id into v_business_id from public.branches where id=new.branch_id;
  if v_business_id is null then return new; end if;
  v_state := public.get_subscription_access_state(v_business_id);
  if v_state='none' then return new; end if;
  if v_state not in ('active','trialing') then raise exception 'QueueDrop subscription is %. Renew or activate a plan to add terminals.',v_state; end if;
  if new.device_type <> 'ticket_terminal' then return new; end if;
  select coalesce(bs.custom_max_terminals,p.max_terminals) into v_limit from public.business_subscriptions bs join public.plans p on p.id=bs.plan_id where bs.business_id=v_business_id;
  if v_limit is null then return new; end if;
  select count(*) into v_count from public.devices d join public.branches b on b.id=d.branch_id where b.business_id=v_business_id and d.device_type='ticket_terminal' and d.id <> coalesce(new.id,gen_random_uuid());
  if v_count >= v_limit then raise exception 'Your subscription allows up to % ticket terminal(s).',v_limit; end if;
  return new;
end; $$;
drop trigger if exists enforce_terminal_subscription_limit on public.devices;
create trigger enforce_terminal_subscription_limit before insert on public.devices for each row execute function public.enforce_terminal_subscription_limit();
