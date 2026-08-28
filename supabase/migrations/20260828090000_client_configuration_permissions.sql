set local check_function_bodies = off;

-- Client-level configuration permissions for branch managers.
alter table public.business_users
  add column if not exists can_view_queue_information_editing boolean not null default false,
  add column if not exists can_view_position_notifications boolean not null default false,
  add column if not exists can_set_branch_status boolean not null default false;

create or replace function public.update_client_configuration_permissions(
  target_user_id uuid,
  target_queue_information_editing boolean,
  target_position_notifications boolean,
  target_branch_status boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_target_role public.user_role;
begin
  select bu.business_id
    into v_business_id
  from public.business_users bu
  where bu.user_id = auth.uid()
    and bu.is_active = true
    and bu.role in ('owner'::public.user_role, 'admin'::public.user_role)
  order by case when bu.role = 'owner'::public.user_role then 0 else 1 end
  limit 1;

  if v_business_id is null then
    raise exception 'Only the business owner/admin can change client configurations';
  end if;

  select bu.role
    into v_target_role
  from public.business_users bu
  where bu.business_id = v_business_id
    and bu.user_id = target_user_id
    and bu.is_active = true
  limit 1;

  if v_target_role is null then
    raise exception 'Team member not found';
  end if;

  if v_target_role <> 'manager'::public.user_role then
    raise exception 'Configuration permissions can only be assigned to branch managers';
  end if;

  update public.business_users
  set can_view_queue_information_editing = coalesce(target_queue_information_editing, false),
      can_view_position_notifications = coalesce(target_position_notifications, false),
      can_set_branch_status = coalesce(target_branch_status, false)
  where business_id = v_business_id
    and user_id = target_user_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  select
    v_business_id,
    auth.uid(),
    'client.configuration_permissions_updated',
    'business_user',
    bu.id,
    jsonb_build_object(
      'target_user_id', target_user_id,
      'queue_information_editing', coalesce(target_queue_information_editing, false),
      'position_notifications', coalesce(target_position_notifications, false),
      'branch_status', coalesce(target_branch_status, false)
    )
  from public.business_users bu
  where bu.business_id = v_business_id
    and bu.user_id = target_user_id
  limit 1;
end;
$$;

revoke all on function public.update_client_configuration_permissions(uuid,boolean,boolean,boolean) from public, anon, service_role;
grant execute on function public.update_client_configuration_permissions(uuid,boolean,boolean,boolean) to authenticated;

-- Owner/Admin can always change branch status. A manager can only change the
-- status of a branch assigned to them when Client Configurations grants it.
create or replace function public.set_assigned_branch_status(
  target_branch_id uuid,
  target_status public.branch_status
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_allowed boolean := false;
begin
  select b.business_id into v_business_id
  from public.branches b
  where b.id = target_branch_id;

  if v_business_id is null then
    raise exception 'Branch not found';
  end if;

  v_allowed := public.is_business_admin(v_business_id);

  if not v_allowed then
    select exists (
      select 1
      from public.business_users bu
      join public.branch_users bru
        on bru.user_id = bu.user_id
       and bru.branch_id = target_branch_id
      where bu.business_id = v_business_id
        and bu.user_id = auth.uid()
        and bu.is_active = true
        and bu.role = 'manager'::public.user_role
        and bu.can_set_branch_status = true
    ) into v_allowed;
  end if;

  if not v_allowed then
    raise exception 'You are not allowed to activate or deactivate this branch';
  end if;

  update public.branches
  set status = target_status
  where id = target_branch_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (
    v_business_id,
    auth.uid(),
    'branch.status_updated',
    'branch',
    target_branch_id,
    jsonb_build_object('status', target_status)
  );
end;
$$;

revoke all on function public.set_assigned_branch_status(uuid,public.branch_status) from public, anon, service_role;
grant execute on function public.set_assigned_branch_status(uuid,public.branch_status) to authenticated;

notify pgrst, 'reload schema';
