-- QueueDrop TEST/PROD access fix
-- Make branch creation use the same secure admin-business helper.

set local check_function_bodies = off;

create or replace function public.create_branch_with_defaults(
  branch_name text,
  branch_address text default null,
  branch_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_name text := btrim(branch_name);
  v_address text := nullif(btrim(branch_address), '');
  v_phone text := nullif(btrim(branch_phone), '');
  v_base_slug text;
  v_slug text;
  v_suffix text;
  v_branch_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  v_business_id := public.get_current_admin_business_id();

  if v_business_id is null then
    raise exception 'Business admin access required';
  end if;

  if not exists (
    select 1
    from public.businesses b
    where b.id = v_business_id
      and b.status = 'active'
  ) then
    raise exception 'Business admin access required';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Branch name must be between 2 and 120 characters';
  end if;

  if v_address is not null and char_length(v_address) > 300 then
    raise exception 'Branch address must be 300 characters or fewer';
  end if;

  if v_phone is not null and char_length(v_phone) > 32 then
    raise exception 'Branch phone must be 32 characters or fewer';
  end if;

  if v_phone is not null and v_phone !~ '^[0-9+() .-]{7,32}$' then
    raise exception 'Branch phone contains invalid characters';
  end if;

  v_base_slug := trim(
    both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')
  );

  if v_base_slug = '' then
    v_base_slug := 'branch';
  end if;

  v_slug := left(v_base_slug, 56);

  while exists (
    select 1
    from public.branches b
    where b.business_id = v_business_id
      and b.slug = v_slug
  ) loop
    v_suffix := left(replace(gen_random_uuid()::text, '-', ''), 6);
    v_slug := left(v_base_slug, 49) || '-' || v_suffix;
  end loop;

  insert into public.branches (
    business_id,
    name,
    slug,
    address,
    phone
  )
  values (
    v_business_id,
    v_name,
    v_slug,
    v_address,
    v_phone
  )
  returning id into v_branch_id;

  insert into public.branch_users (
    branch_id,
    user_id
  )
  values (
    v_branch_id,
    v_user_id
  )
  on conflict (branch_id, user_id) do nothing;

  insert into public.queue_configurations (
    branch_id
  )
  values (
    v_branch_id
  );

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
    'branch.created',
    'branch',
    v_branch_id,
    jsonb_build_object(
      'branch_name',
      v_name
    )
  );

  return v_branch_id;
end;
$$;

revoke all on function public.create_branch_with_defaults(text, text, text)
from public, anon, service_role;

grant execute on function public.create_branch_with_defaults(text, text, text)
to authenticated;
