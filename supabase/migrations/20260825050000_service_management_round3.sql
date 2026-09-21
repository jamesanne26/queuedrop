-- QueueDrop TEST/PROD service management hardening.
-- Keep the current admin-business helper consistent with the authorization
-- path proven by branch edit/delete and safe under business_users RLS.
create or replace function public.get_current_admin_business_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.id
  from public.businesses b
  where b.status = 'active'
    and public.is_business_admin(b.id)
  order by b.created_at
  limit 1;
$$;

revoke all on function public.get_current_admin_business_id()
from public, anon, service_role;

grant execute on function public.get_current_admin_business_id()
to authenticated;

-- Adds service editing and refreshes the PostgREST schema cache after
-- replacing service RPCs so existing TEST databases see the functions.

set local check_function_bodies = off;

create or replace function public.update_service_for_branch(
  target_service_id uuid,
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
  v_old_name text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select b.business_id, s.name
  into v_business_id, v_old_name
  from public.services s
  join public.branches b on b.id = s.branch_id
  where s.id = target_service_id
    and s.branch_id = target_branch_id
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

  update public.services
  set
    name = v_name,
    description = v_description,
    queue_prefix = v_prefix,
    estimated_minutes = service_estimated_minutes
  where id = target_service_id
    and branch_id = target_branch_id
  returning id into v_service_id;

  if v_service_id is null then
    raise exception 'Service could not be updated';
  end if;

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
    'service.updated',
    'service',
    v_service_id,
    jsonb_build_object(
      'branch_id', target_branch_id,
      'old_service_name', v_old_name,
      'service_name', v_name
    )
  );

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
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select b.business_id, s.name
  into v_business_id, v_service_name
  from public.services s
  join public.branches b on b.id = s.branch_id
  where s.id = target_service_id
    and public.is_business_admin(b.business_id)
  limit 1;

  if v_business_id is null then
    raise exception 'Business admin access required';
  end if;

  update public.services
  set is_active = target_is_active
  where id = target_service_id;

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
    case
      when target_is_active then 'service.activated'
      else 'service.deactivated'
    end,
    'service',
    target_service_id,
    jsonb_build_object(
      'service_name', v_service_name
    )
  );
end;
$$;

revoke all on function public.update_service_for_branch(uuid, uuid, text, text, text, integer)
from public, anon, service_role;

revoke all on function public.set_service_active(uuid, boolean)
from public, anon, service_role;

grant execute on function public.update_service_for_branch(uuid, uuid, text, text, text, integer)
to authenticated;

grant execute on function public.set_service_active(uuid, boolean)
to authenticated;

notify pgrst, 'reload schema';
