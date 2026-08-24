-- QueueDrop TEST/PROD access hardening.
-- Provides server-action-safe helpers so owner/admin checks do not depend on
-- direct SELECT visibility of business_users under RLS.

set local check_function_bodies = off;

create or replace function public.get_current_business_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select bu.role
  from public.business_users bu
  where bu.user_id = auth.uid()
    and bu.is_active = true
  order by
    case
      when bu.role = 'owner'::public.user_role then 0
      when bu.role = 'admin'::public.user_role then 1
      when bu.role = 'manager'::public.user_role then 2
      else 3
    end,
    bu.created_at
  limit 1;
$$;

create or replace function public.get_current_admin_business_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select bu.business_id
  from public.business_users bu
  where bu.user_id = auth.uid()
    and bu.is_active = true
    and bu.role in ('owner'::public.user_role, 'admin'::public.user_role)
  order by
    case
      when bu.role = 'owner'::public.user_role then 0
      else 1
    end,
    bu.created_at
  limit 1;
$$;

create or replace function public.get_admin_business_id_for_branch(target_branch_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.business_id
  from public.branches b
  where b.id = target_branch_id
    and public.is_business_admin(b.business_id)
  limit 1;
$$;

revoke all on function public.get_current_business_role() from public, anon, service_role;
revoke all on function public.get_current_admin_business_id() from public, anon, service_role;
revoke all on function public.get_admin_business_id_for_branch(uuid) from public, anon, service_role;

grant execute on function public.get_current_business_role() to authenticated;
grant execute on function public.get_current_admin_business_id() to authenticated;
grant execute on function public.get_admin_business_id_for_branch(uuid) to authenticated;

-- Keep the service RPC available even when the earlier migration was not yet
-- applied to an existing TEST database.
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
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select b.business_id
  into v_business_id
  from public.branches b
  where b.id = target_branch_id
    and b.status = 'active'
    and public.is_business_admin(b.business_id)
  limit 1;

  if v_business_id is null then
    raise exception 'Active branch with business admin access required';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Service name must be between 2 and 120 characters';
  end if;

  if v_description is not null and char_length(v_description) > 500 then
    raise exception 'Service description must be 500 characters or fewer';
  end if;

  if v_prefix is not null and v_prefix !~ '^[A-Z0-9]{1,6}$' then
    raise exception 'Queue prefix must be 1-6 letters or numbers';
  end if;

  if service_estimated_minutes is not null
     and (service_estimated_minutes < 1 or service_estimated_minutes > 480) then
    raise exception 'Estimated minutes must be between 1 and 480';
  end if;

  insert into public.services (
    branch_id,
    name,
    description,
    queue_prefix,
    estimated_minutes
  )
  values (
    target_branch_id,
    v_name,
    v_description,
    v_prefix,
    service_estimated_minutes
  )
  returning id into v_service_id;

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
    'service.created',
    'service',
    v_service_id,
    jsonb_build_object(
      'branch_id', target_branch_id,
      'service_name', v_name
    )
  );

  return v_service_id;
end;
$$;

revoke all on function public.create_service_for_branch(uuid, text, text, text, integer)
from public, anon, service_role;

grant execute on function public.create_service_for_branch(uuid, text, text, text, integer)
to authenticated;
