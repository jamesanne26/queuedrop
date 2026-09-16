-- Make QueueDrop queue mutations honor the employee's explicit permission flags.
-- Owner/Admin retain full operational authority; all other users are permission-driven.
set local check_function_bodies = off;

create or replace function public.qd_has_queue_permission(required_permission text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists (
    select 1 from public.business_users bu
    where bu.user_id=auth.uid() and bu.is_active=true and (
      bu.role in ('owner','admin') or
      (required_permission='call' and coalesce(bu.can_call_customer,false)) or
      (required_permission='serve' and coalesce(bu.can_serve_customer,false)) or
      (required_permission='return' and coalesce(bu.can_return_customer,false)) or
      (required_permission='move_pending' and coalesce(bu.can_move_pending,false)) or
      (required_permission='complete' and coalesce(bu.can_complete_ticket,false)) or
      (required_permission='cancel' and coalesce(bu.can_cancel_ticket,false)) or
      (required_permission='no_show' and coalesce(bu.can_mark_no_show,false))
    )
  );
$$;

create or replace function public.qd_staff_call_next(target_branch_id uuid,target_service_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.qd_has_queue_permission('call') then raise exception 'You do not have permission to call customers'; end if;
  return public.staff_call_next(target_branch_id,target_service_id);
end $$;

create or replace function public.qd_staff_update_ticket_status(target_ticket_id uuid,target_action text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p text;
begin
  p := case lower(btrim(target_action)) when 'complete' then 'complete' when 'cancel' then 'cancel' when 'no_show' then 'no_show' when 'recall' then 'call' when 'return_last' then 'return' when 'pending' then 'move_pending' else 'serve' end;
  if not public.qd_has_queue_permission(p) then raise exception 'You do not have permission to perform this queue action'; end if;
  return public.staff_update_ticket_status(target_ticket_id,target_action);
end $$;

create or replace function public.qd_staff_return_ticket_to_last(target_ticket_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.qd_has_queue_permission('return') then raise exception 'You do not have permission to return customers'; end if;
  return public.staff_return_ticket_to_last(target_ticket_id);
end $$;

create or replace function public.qd_staff_return_last_to_queue(target_branch_id uuid,target_service_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.qd_has_queue_permission('return') then raise exception 'You do not have permission to return customers'; end if;
  return public.staff_return_last_to_queue(target_branch_id,target_service_id);
end $$;

revoke all on function public.qd_has_queue_permission(text) from public,anon;
grant execute on function public.qd_has_queue_permission(text) to authenticated;
revoke all on function public.qd_staff_call_next(uuid,uuid) from public,anon;
revoke all on function public.qd_staff_update_ticket_status(uuid,text) from public,anon;
revoke all on function public.qd_staff_return_ticket_to_last(uuid) from public,anon;
revoke all on function public.qd_staff_return_last_to_queue(uuid,uuid) from public,anon;
grant execute on function public.qd_staff_call_next(uuid,uuid) to authenticated;
grant execute on function public.qd_staff_update_ticket_status(uuid,text) to authenticated;
grant execute on function public.qd_staff_return_ticket_to_last(uuid) to authenticated;
grant execute on function public.qd_staff_return_last_to_queue(uuid,uuid) to authenticated;

-- Direct catalog writes must also honor Manage Services, not merely base role.
drop policy if exists business_services_admin_write on public.business_services;
create policy business_services_permission_write on public.business_services for all using (
  public.is_business_admin(business_id) or exists(select 1 from public.business_users bu where bu.business_id=business_services.business_id and bu.user_id=auth.uid() and bu.is_active=true and bu.can_manage_services=true)
) with check (
  public.is_business_admin(business_id) or exists(select 1 from public.business_users bu where bu.business_id=business_services.business_id and bu.user_id=auth.uid() and bu.is_active=true and bu.can_manage_services=true)
);
drop policy if exists branch_service_catalog_admin_write on public.branch_service_catalog;
create policy branch_service_catalog_permission_write on public.branch_service_catalog for all using (
  exists(select 1 from public.branches b join public.business_users bu on bu.business_id=b.business_id where b.id=branch_id and bu.user_id=auth.uid() and bu.is_active=true and (bu.role in ('owner','admin') or bu.can_manage_services=true))
) with check (
  exists(select 1 from public.branches b join public.business_users bu on bu.business_id=b.business_id where b.id=branch_id and bu.user_id=auth.uid() and bu.is_active=true and (bu.role in ('owner','admin') or bu.can_manage_services=true))
);
notify pgrst,'reload schema';
