-- Repair helper used by the public queue RPC in environments with migration drift.
-- TEST-only deployment at this stage.

set local check_function_bodies = off;
create or replace function public.is_branch_open_now(target_branch_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
  v_local timestamp;
  v_day smallint;
  v_time time;
  v_is_open boolean;
  v_open_time time;
  v_close_time time;
begin
  select timezone into v_timezone
  from public.branches
  where id = target_branch_id;

  if v_timezone is null then
    return false;
  end if;

  begin
    v_local := timezone(v_timezone, now());
  exception when others then
    return false;
  end;

  v_day := extract(dow from v_local)::smallint;
  v_time := v_local::time;

  select oh.is_open, oh.open_time, oh.close_time
    into v_is_open, v_open_time, v_close_time
  from public.operating_hours oh
  where oh.branch_id = target_branch_id
    and oh.day_of_week = v_day;

  -- Keep backwards-compatible behavior: no hours row means open.
  if not found then
    return true;
  end if;

  if not v_is_open then
    return false;
  end if;

  -- Support both normal daytime schedules and schedules that cross midnight.
  if v_open_time = v_close_time then
    return true;
  elsif v_open_time < v_close_time then
    return v_time >= v_open_time and v_time < v_close_time;
  else
    return v_time >= v_open_time or v_time < v_close_time;
  end if;
end;
$$;
revoke all on function public.is_branch_open_now(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_branch_open_now(uuid)
  to postgres, service_role;
-- The public queue RPC is SECURITY DEFINER and calls this helper internally.
-- Refresh PostgREST so the repaired function dependency is immediately visible.
notify pgrst, 'reload schema';
