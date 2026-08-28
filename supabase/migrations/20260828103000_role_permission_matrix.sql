-- QueueDrop role permission matrix.
-- Owner/Admin are business-wide in application/RLS logic.
-- Manager permissions are configurable and branch-scoped.
-- Staff permissions are intentionally limited to queue operations.

alter table public.business_users
  add column if not exists can_set_branch_status boolean not null default false,
  add column if not exists can_manage_services boolean not null default false,
  add column if not exists can_manage_operating_hours boolean not null default false,
  add column if not exists can_manage_team boolean not null default false,
  add column if not exists can_manage_kiosk_display boolean not null default false,
  add column if not exists can_add_customer boolean not null default false,
  add column if not exists can_edit_customer boolean not null default false,
  add column if not exists can_call_customer boolean not null default false,
  add column if not exists can_serve_customer boolean not null default false,
  add column if not exists can_complete_ticket boolean not null default false,
  add column if not exists can_cancel_ticket boolean not null default false,
  add column if not exists can_mark_no_show boolean not null default false,
  add column if not exists can_view_customer_contact boolean not null default false,
  add column if not exists can_view_reports boolean not null default false,
  add column if not exists can_export_reports boolean not null default false,
  add column if not exists can_view_audit_logs boolean not null default false;

-- Compatibility defaults for existing accounts.
update public.business_users
set
  can_set_branch_status = true,
  can_manage_services = true,
  can_manage_operating_hours = true,
  can_manage_team = true,
  can_manage_kiosk_display = true,
  can_add_customer = true,
  can_edit_customer = true,
  can_call_customer = true,
  can_serve_customer = true,
  can_complete_ticket = true,
  can_cancel_ticket = true,
  can_mark_no_show = true,
  can_view_customer_contact = true,
  can_view_reports = true,
  can_export_reports = true
where role = 'manager';

update public.business_users
set
  can_add_customer = true,
  can_edit_customer = true,
  can_call_customer = true,
  can_serve_customer = true,
  can_complete_ticket = true,
  can_cancel_ticket = true,
  can_mark_no_show = true,
  can_view_customer_contact = true
where role = 'staff';

create or replace function public.enforce_business_user_permission_ceiling()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role = 'staff' then
    new.can_view_queue_information_editing := false;
    new.can_view_position_notifications := false;
    new.can_set_branch_status := false;
    new.can_manage_services := false;
    new.can_manage_operating_hours := false;
    new.can_manage_team := false;
    new.can_manage_kiosk_display := false;
    new.can_view_reports := false;
    new.can_export_reports := false;
    new.can_view_audit_logs := false;
  elsif new.role = 'manager' then
    new.can_view_audit_logs := false;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_business_user_permission_ceiling on public.business_users;
create trigger enforce_business_user_permission_ceiling
before insert or update on public.business_users
for each row execute function public.enforce_business_user_permission_ceiling();
