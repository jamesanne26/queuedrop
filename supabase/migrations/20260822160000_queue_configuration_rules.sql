set local check_function_bodies = off;

-- Staff can read operating hours only for assigned branches; owner/admin remain business-wide.
drop policy if exists "Business members can view operating hours" on public.operating_hours;
create policy "Scoped members can view operating hours" on public.operating_hours
  for select to authenticated
  using (
    exists (
      select 1
      from public.branches b
      where b.id = operating_hours.branch_id
        and (
          public.is_business_admin(b.business_id)
          or public.is_branch_member(b.id)
        )
    )
  );

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

  -- A branch without an hours row remains open for backwards compatibility.
  if not found then
    return true;
  end if;

  if not v_is_open then
    return false;
  end if;

  return v_time >= v_open_time and v_time < v_close_time;
end;
$$;

revoke all on function public.is_branch_open_now(uuid) from public, anon, authenticated, service_role;
grant execute on function public.is_branch_open_now(uuid) to postgres, service_role;

-- Keep the original implementations private, then expose guarded wrappers.
alter function public.get_public_branch_queue(text, text)
  rename to get_public_branch_queue_unchecked;

revoke all on function public.get_public_branch_queue_unchecked(text, text) from public, anon, authenticated, service_role;

create function public.get_public_branch_queue(
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
  v_branch_id uuid;
  v_open boolean;
begin
  select br.id into v_branch_id
  from public.businesses b
  join public.branches br on br.business_id = b.id
  where b.slug = lower(btrim(target_business_slug))
    and br.slug = lower(btrim(target_branch_slug))
    and b.status = 'active'
    and br.status = 'active'
  limit 1;

  if v_branch_id is null then
    return null;
  end if;

  v_result := public.get_public_branch_queue_unchecked(target_business_slug, target_branch_slug);
  if v_result is null then
    return null;
  end if;

  v_open := public.is_branch_open_now(v_branch_id);
  return v_result || jsonb_build_object(
    'queue_open', v_open,
    'queue_status_message', case when v_open then 'Open for joining' else 'Branch is currently closed' end
  );
end;
$$;

grant execute on function public.get_public_branch_queue(text, text) to anon, authenticated, service_role;

alter function public.join_public_queue(text, text, uuid, text, text)
  rename to join_public_queue_unchecked;

revoke all on function public.join_public_queue_unchecked(text, text, uuid, text, text) from public, anon, authenticated, service_role;

create function public.join_public_queue(
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
  v_branch_id uuid;
  v_queue_active boolean;
  v_allow_qr_join boolean;
begin
  select br.id, qc.is_active, qc.allow_qr_join
    into v_branch_id, v_queue_active, v_allow_qr_join
  from public.businesses b
  join public.branches br on br.business_id = b.id
  join public.queue_configurations qc on qc.branch_id = br.id
  where b.slug = lower(btrim(target_business_slug))
    and br.slug = lower(btrim(target_branch_slug))
    and b.status = 'active'
    and br.status = 'active'
  limit 1;

  if v_branch_id is null then
    raise exception 'This queue is not available';
  end if;
  if not v_queue_active then
    raise exception 'This branch queue is currently inactive';
  end if;
  if not v_allow_qr_join then
    raise exception 'Public queue joining is currently disabled';
  end if;
  if not public.is_branch_open_now(v_branch_id) then
    raise exception 'The branch is currently closed';
  end if;

  return public.join_public_queue_unchecked(
    target_business_slug,
    target_branch_slug,
    target_service_id,
    customer_name,
    customer_phone
  );
end;
$$;

grant execute on function public.join_public_queue(text, text, uuid, text, text) to anon, authenticated, service_role;
