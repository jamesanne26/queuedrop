-- QueueDrop production security hardening.
-- 1) Durable application rate limiting for public routes.
-- 2) Enforce active/trialing subscription on new queue tickets and non-terminal queue state changes.

create table if not exists public.app_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null default now(),
  hits integer not null default 0 check (hits >= 0),
  updated_at timestamptz not null default now()
);

alter table public.app_rate_limits enable row level security;
revoke all on table public.app_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.app_rate_limits to service_role;

create or replace function public.consume_app_rate_limit(
  target_key text,
  target_limit integer,
  target_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_row public.app_rate_limits%rowtype;
  v_window interval;
  v_allowed boolean;
  v_retry integer;
begin
  if target_key is null or length(target_key) < 16 then raise exception 'Invalid rate-limit key'; end if;
  if target_limit < 1 or target_limit > 10000 then raise exception 'Invalid rate-limit limit'; end if;
  if target_window_seconds < 1 or target_window_seconds > 86400 then raise exception 'Invalid rate-limit window'; end if;

  v_window := make_interval(secs => target_window_seconds);

  insert into public.app_rate_limits(rate_key, window_started_at, hits, updated_at)
  values(target_key, v_now, 1, v_now)
  on conflict(rate_key) do update
  set window_started_at = case
        when public.app_rate_limits.window_started_at + v_window <= v_now then v_now
        else public.app_rate_limits.window_started_at
      end,
      hits = case
        when public.app_rate_limits.window_started_at + v_window <= v_now then 1
        else public.app_rate_limits.hits + 1
      end,
      updated_at = v_now
  returning * into v_row;

  v_allowed := v_row.hits <= target_limit;
  v_retry := greatest(1, ceil(extract(epoch from ((v_row.window_started_at + v_window) - v_now)))::integer);
  return jsonb_build_object('allowed', v_allowed, 'retry_after_seconds', v_retry, 'hits', v_row.hits);
end;
$$;

revoke all on function public.consume_app_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_app_rate_limit(text,integer,integer) to service_role;

create or replace function public.enforce_ticket_subscription_access()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
begin
  select business_id into v_business_id from public.branches where id = new.branch_id;
  if v_business_id is null then return new; end if;

  if tg_op = 'INSERT' then
    perform public.require_subscription_write_access(v_business_id);
    return new;
  end if;

  if new.status is distinct from old.status then
    -- Always allow terminal cleanup states so an expired workspace can safely
    -- finish/cancel customers already in progress, but block continued operation.
    if new.status not in ('completed','cancelled','no_show') then
      perform public.require_subscription_write_access(v_business_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_ticket_subscription_access on public.tickets;
create trigger enforce_ticket_subscription_access
before insert or update of status on public.tickets
for each row execute function public.enforce_ticket_subscription_access();

create index if not exists idx_app_rate_limits_updated_at on public.app_rate_limits(updated_at);

notify pgrst, 'reload schema';
