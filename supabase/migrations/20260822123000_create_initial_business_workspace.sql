set local check_function_bodies = off;

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

  if v_phone is not null and char_length(v_phone) > 32 then
    raise exception 'Branch phone must be 32 characters or fewer';
  end if;

  if v_phone is not null and v_phone !~ '^[0-9+() .-]{7,32}$' then
    raise exception 'Branch phone contains invalid characters';
  end if;

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

  insert into public.business_users (business_id, user_id, role)
  values (v_business_id, v_user_id, 'owner');

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
      'branch_name', v_branch_name
    )
  );

  return query
  select v_business_id, v_branch_id, v_business_slug, v_branch_slug;
end;
$$;

revoke all on function public.create_initial_business_workspace(text, text, text, text) from public;
revoke all on function public.create_initial_business_workspace(text, text, text, text) from anon;
grant execute on function public.create_initial_business_workspace(text, text, text, text) to authenticated;
