-- QueueDrop custom employee role labels + owner/admin configurable access.
-- IMPORTANT: back up the target database before applying this migration.

alter table public.business_users
  add column if not exists custom_role_name text;

alter table public.business_users
  drop constraint if exists business_users_custom_role_name_length;
alter table public.business_users
  add constraint business_users_custom_role_name_length
  check (custom_role_name is null or char_length(btrim(custom_role_name)) between 2 and 60);

create or replace function public.set_employee_access(
  target_user_id uuid,
  target_custom_role_name text,
  target_can_set_branch_status boolean,
  target_can_manage_services boolean,
  target_can_manage_operating_hours boolean,
  target_can_manage_team boolean,
  target_can_manage_kiosk_display boolean,
  target_can_add_customer boolean,
  target_can_edit_customer boolean,
  target_can_call_customer boolean,
  target_can_serve_customer boolean,
  target_can_complete_ticket boolean,
  target_can_cancel_ticket boolean,
  target_can_mark_no_show boolean,
  target_can_view_customer_contact boolean,
  target_can_view_reports boolean,
  target_can_export_reports boolean,
  target_can_view_audit_logs boolean,
  target_can_view_queue_information_editing boolean,
  target_can_view_position_notifications boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_business_id uuid;
  actor_role public.user_role;
  target_role public.user_role;
begin
  select bu.business_id, bu.role
    into actor_business_id, actor_role
  from public.business_users bu
  where bu.user_id = auth.uid() and bu.is_active = true
  limit 1;

  if actor_business_id is null or actor_role not in ('owner', 'admin') then
    raise exception 'Only the business owner or admin can configure employee roles and permissions.';
  end if;

  select bu.role into target_role
  from public.business_users bu
  where bu.business_id = actor_business_id and bu.user_id = target_user_id;

  if target_role is null then raise exception 'Team member not found.'; end if;
  if target_role in ('owner', 'admin') then raise exception 'Owner and admin access is protected.'; end if;
  if char_length(btrim(coalesce(target_custom_role_name, ''))) not between 2 and 60 then
    raise exception 'Role name must be between 2 and 60 characters.';
  end if;

  update public.business_users
  set custom_role_name = btrim(target_custom_role_name),
      can_set_branch_status = target_can_set_branch_status,
      can_manage_services = target_can_manage_services,
      can_manage_operating_hours = target_can_manage_operating_hours,
      can_manage_team = target_can_manage_team,
      can_manage_kiosk_display = target_can_manage_kiosk_display,
      can_add_customer = target_can_add_customer,
      can_edit_customer = target_can_edit_customer,
      can_call_customer = target_can_call_customer,
      can_serve_customer = target_can_serve_customer,
      can_complete_ticket = target_can_complete_ticket,
      can_cancel_ticket = target_can_cancel_ticket,
      can_mark_no_show = target_can_mark_no_show,
      can_view_customer_contact = target_can_view_customer_contact,
      can_view_reports = target_can_view_reports,
      can_export_reports = target_can_export_reports,
      can_view_audit_logs = target_can_view_audit_logs,
      can_view_queue_information_editing = target_can_view_queue_information_editing,
      can_view_position_notifications = target_can_view_position_notifications
  where business_id = actor_business_id and user_id = target_user_id;
end;
$$;

revoke all on function public.set_employee_access(uuid,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) from public;
grant execute on function public.set_employee_access(uuid,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;
