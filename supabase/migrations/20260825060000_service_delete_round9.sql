-- QueueDrop Round 9: safe service deletion.
-- Services with queue/ticket history must be deactivated instead of deleted.
set local check_function_bodies = off;

create or replace function public.delete_service_for_branch(
  target_service_id uuid,
  target_branch_id uuid
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
  v_history_count bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select b.business_id, s.name
  into v_business_id, v_service_name
  from public.services s
  join public.branches b on b.id = s.branch_id
  where s.id = target_service_id
    and s.branch_id = target_branch_id
    and public.is_business_admin(b.business_id)
  limit 1;

  if v_business_id is null then
    raise exception 'Business admin access required';
  end if;

  select count(*)
  into v_history_count
  from public.tickets t
  where t.service_id = target_service_id;

  if v_history_count > 0 then
    raise exception 'This service has queue history and cannot be deleted. Deactivate it instead.';
  end if;

  delete from public.services
  where id = target_service_id
    and branch_id = target_branch_id;

  if not found then
    raise exception 'Service could not be deleted';
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
    'service.deleted',
    'service',
    target_service_id,
    jsonb_build_object(
      'service_name', v_service_name,
      'branch_id', target_branch_id
    )
  );
end;
$$;

revoke all on function public.delete_service_for_branch(uuid, uuid)
from public, anon, service_role;

grant execute on function public.delete_service_for_branch(uuid, uuid)
to authenticated;

notify pgrst, 'reload schema';
