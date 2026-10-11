-- Align the role ceiling trigger function with the fixed schema search path
-- and explicitly qualified enum values used by the tested database.
create or replace function public.enforce_business_user_permission_ceiling()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.role = 'staff'::public.user_role then
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
  elsif new.role = 'manager'::public.user_role then
    new.can_view_audit_logs := false;
  end if;
  return new;
end;
$function$;
