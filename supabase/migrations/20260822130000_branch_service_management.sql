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
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select bu.business_id into v_business_id
  from public.business_users bu
  join public.businesses b on b.id = bu.business_id
  where bu.user_id = v_user_id
    and bu.role in ('owner', 'admin')
    and b.status = 'active'
  order by bu.created_at
  limit 1;

  if v_business_id is null then raise exception 'Business admin access required'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'Branch name must be between 2 and 120 characters'; end if;
  if v_address is not null and char_length(v_address) > 300 then raise exception 'Branch address must be 300 characters or fewer'; end if;
  if v_phone is not null and char_length(v_phone) > 32 then raise exception 'Branch phone must be 32 characters or fewer'; end if;
  if v_phone is not null and v_phone !~ '^[0-9+() .-]{7,32}$' then raise exception 'Branch phone contains invalid characters'; end if;

  v_base_slug := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if v_base_slug = '' then v_base_slug := 'branch'; end if;
  v_slug := left(v_base_slug, 56);
  while exists (select 1 from public.branches b where b.business_id = v_business_id and b.slug = v_slug) loop
    v_suffix := left(replace(gen_random_uuid()::text, '-', ''), 6);
    v_slug := left(v_base_slug, 49) || '-' || v_suffix;
  end loop;

  insert into public.branches (business_id, name, slug, address, phone)
  values (v_business_id, v_name, v_slug, v_address, v_phone)
  returning id into v_branch_id;

  insert into public.branch_users (branch_id, user_id)
  values (v_branch_id, v_user_id)
  on conflict (branch_id, user_id) do nothing;

  insert into public.queue_configurations (branch_id) values (v_branch_id);

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (v_business_id, v_user_id, 'branch.created', 'branch', v_branch_id, jsonb_build_object('branch_name', v_name));

  return v_branch_id;
end;
$$;

create or replace function public.create_service_for_branch(
  target_branch_id uuid,
  service_name text,
  service_description text default null,
  service_queue_prefix text default null,
  service_estimated_minutes integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_name text := btrim(service_name);
  v_description text := nullif(btrim(service_description), '');
  v_prefix text := nullif(upper(btrim(service_queue_prefix)), '');
  v_service_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select b.business_id into v_business_id
  from public.branches b
  where b.id = target_branch_id
    and b.status = 'active'
    and public.is_business_admin(b.business_id);

  if v_business_id is null then raise exception 'Active branch with business admin access required'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'Service name must be between 2 and 120 characters'; end if;
  if v_description is not null and char_length(v_description) > 500 then raise exception 'Service description must be 500 characters or fewer'; end if;
  if v_prefix is not null and v_prefix !~ '^[A-Z0-9]{1,6}$' then raise exception 'Queue prefix must be 1-6 letters or numbers'; end if;
  if service_estimated_minutes is not null and (service_estimated_minutes < 1 or service_estimated_minutes > 480) then raise exception 'Estimated minutes must be between 1 and 480'; end if;

  insert into public.services (branch_id, name, description, queue_prefix, estimated_minutes)
  values (target_branch_id, v_name, v_description, v_prefix, service_estimated_minutes)
  returning id into v_service_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (v_business_id, v_user_id, 'service.created', 'service', v_service_id,
    jsonb_build_object('branch_id', target_branch_id, 'service_name', v_name));

  return v_service_id;
end;
$$;

create or replace function public.set_service_active(
  target_service_id uuid,
  target_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_service_name text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select b.business_id, s.name into v_business_id, v_service_name
  from public.services s
  join public.branches b on b.id = s.branch_id
  where s.id = target_service_id
    and public.is_business_admin(b.business_id);

  if v_business_id is null then raise exception 'Business admin access required'; end if;

  update public.services set is_active = target_is_active where id = target_service_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (v_business_id, v_user_id,
    case when target_is_active then 'service.activated' else 'service.deactivated' end,
    'service', target_service_id, jsonb_build_object('service_name', v_service_name));
end;
$$;

revoke all on function public.create_branch_with_defaults(text, text, text) from public, anon, service_role;
revoke all on function public.create_service_for_branch(uuid, text, text, text, integer) from public, anon, service_role;
revoke all on function public.set_service_active(uuid, boolean) from public, anon, service_role;
grant execute on function public.create_branch_with_defaults(text, text, text) to authenticated;
grant execute on function public.create_service_for_branch(uuid, text, text, text, integer) to authenticated;
grant execute on function public.set_service_active(uuid, boolean) to authenticated;
