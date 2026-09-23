-- Create a terminal and configure its branch exit PIN in one transaction and
-- one client/database round trip. This keeps permission checks server-side and
-- prevents partially-created terminals.

set local check_function_bodies = off;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.create_stub_terminal(
  target_branch_id uuid,
  target_service_id uuid,
  target_name text,
  target_pin text
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_business_id uuid;
  v_role public.user_role;
  v_name text := btrim(coalesce(target_name, ''));
  v_pin text := btrim(coalesce(target_pin, ''));
  v_device public.devices%rowtype;
begin
  if auth.uid() is null then raise exception 'Your session expired. Sign in again and retry'; end if;
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'Terminal name must contain 2 to 120 characters'; end if;
  if v_pin !~ '^[0-9]{4,8}$' then raise exception 'Terminal PIN must contain 4 to 8 digits'; end if;

  select br.business_id, bu.role
    into v_business_id, v_role
  from public.branches br
  join public.business_users bu
    on bu.business_id = br.business_id
   and bu.user_id = auth.uid()
   and bu.is_active = true
  where br.id = target_branch_id
  limit 1;

  if v_business_id is null then raise exception 'The selected branch is not available to this business'; end if;
  if v_role not in ('owner','admin') then raise exception 'You do not have permission to create terminals'; end if;
  if not exists (
    select 1 from public.services s
    where s.id = target_service_id
      and s.branch_id = target_branch_id
      and s.is_active = true
  ) then raise exception 'Selected default service does not belong to the selected branch'; end if;

  update public.branches
  set kiosk_exit_pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf', 10)),
      updated_at = now()
  where id = target_branch_id and business_id = v_business_id;

  insert into public.devices(branch_id, service_id, name, device_type, is_active)
  values(target_branch_id, target_service_id, v_name, 'ticket_terminal', true)
  returning * into v_device;

  insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,details)
  values(v_business_id,auth.uid(),'terminal.created','device',v_device.id,
    jsonb_build_object('branch_id',target_branch_id,'service_id',target_service_id,'pin_configured',true));

  return jsonb_build_object('id',v_device.id,'device_token',v_device.device_token,'name',v_device.name);
end;
$$;

revoke all on function public.create_stub_terminal(uuid,uuid,text,text) from public,anon,service_role;
grant execute on function public.create_stub_terminal(uuid,uuid,text,text) to authenticated;

notify pgrst, 'reload schema';
