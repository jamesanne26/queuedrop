-- QueueDrop branch settings isolation hardening.
-- Terminal exit PINs are now branch-scoped so every control under a selected
-- branch changes only that branch. Existing business PINs are copied once to
-- current branches to preserve behavior during the migration.

set local check_function_bodies = off;
create extension if not exists pgcrypto with schema extensions;

alter table public.branches
  add column if not exists kiosk_exit_pin_hash text;

update public.branches br
set kiosk_exit_pin_hash = b.kiosk_exit_pin_hash
from public.businesses b
where b.id = br.business_id
  and br.kiosk_exit_pin_hash is null
  and b.kiosk_exit_pin_hash is not null;

create or replace function public.set_branch_kiosk_exit_pin(target_branch_id uuid, target_pin text)
returns void
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_business_id uuid;
  v_role public.user_role;
  v_pin text := btrim(coalesce(target_pin,''));
begin
  select br.business_id into v_business_id
  from public.branches br
  where br.id = target_branch_id;

  if v_business_id is null then
    raise exception 'Branch not found';
  end if;

  select bu.role into v_role
  from public.business_users bu
  where bu.business_id = v_business_id
    and bu.user_id = auth.uid()
    and bu.is_active = true
  limit 1;

  if v_role not in ('owner','admin') then
    raise exception 'Only an owner or admin can change the branch kiosk exit PIN';
  end if;
  if v_pin !~ '^[0-9]{4,8}$' then
    raise exception 'Kiosk exit PIN must contain 4 to 8 digits';
  end if;

  update public.branches
  set kiosk_exit_pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf', 10)),
      updated_at = now()
  where id = target_branch_id and business_id = v_business_id;

  insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,details)
  values(v_business_id,auth.uid(),'kiosk.exit_pin_updated','branch',target_branch_id,jsonb_build_object('configured',true));
end;
$$;

revoke all on function public.set_branch_kiosk_exit_pin(uuid,text) from public,anon,service_role;
grant execute on function public.set_branch_kiosk_exit_pin(uuid,text) to authenticated;

create or replace function public.verify_kiosk_exit_pin(target_device_token uuid, target_pin text)
returns boolean
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_device public.devices%rowtype;
  v_business_id uuid;
  v_hash text;
  v_is_member boolean;
  v_pin text := btrim(coalesce(target_pin,''));
begin
  select d.* into v_device
  from public.devices d
  where d.device_token=target_device_token
    and d.device_type='ticket_terminal'
    and d.is_active=true
  limit 1;
  if v_device.id is null then raise exception 'Terminal not found'; end if;

  select br.business_id, br.kiosk_exit_pin_hash
    into v_business_id, v_hash
  from public.branches br
  where br.id=v_device.branch_id;

  select exists(
    select 1 from public.business_users bu
    where bu.business_id=v_business_id and bu.user_id=auth.uid() and bu.is_active=true
  ) into v_is_member;
  if not coalesce(v_is_member,false) then raise exception 'Active dashboard session required'; end if;

  if v_device.kiosk_pin_locked_until is not null and v_device.kiosk_pin_locked_until > now() then
    raise exception 'Too many attempts. Try again in one minute';
  end if;

  if v_hash is null then raise exception 'Kiosk exit PIN is not configured for this branch'; end if;

  if extensions.crypt(v_pin, v_hash) = v_hash then
    update public.devices
      set kiosk_pin_failed_attempts=0, kiosk_pin_locked_until=null, updated_at=now()
    where id=v_device.id;
    return true;
  end if;

  update public.devices
  set kiosk_pin_failed_attempts = kiosk_pin_failed_attempts + 1,
      kiosk_pin_locked_until = case when kiosk_pin_failed_attempts + 1 >= 5 then now() + interval '1 minute' else null end,
      updated_at=now()
  where id=v_device.id;

  return false;
end;
$$;

revoke all on function public.verify_kiosk_exit_pin(uuid,text) from public,anon,service_role;
grant execute on function public.verify_kiosk_exit_pin(uuid,text) to authenticated;

create or replace function public.get_stub_terminal(target_device_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'device_id', d.id,
    'device_name', d.name,
    'branch_id', br.id,
    'branch_name', br.name,
    'business_name', b.name,
    'service_id', ds.id,
    'service_name', ds.name,
    'queue_prefix', coalesce(nullif(ds.queue_prefix, ''), qc.ticket_prefix, 'Q'),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'queue_prefix', s.queue_prefix) order by s.name)
      from public.services s
      where s.branch_id = br.id and s.is_active = true
    ), '[]'::jsonb),
    'stub_mode_enabled', qc.stub_mode_enabled,
    'queue_active', qc.is_active,
    'branch_open', public.is_branch_open_now(br.id),
    'exit_pin_configured', br.kiosk_exit_pin_hash is not null,
    'terminal_theme', coalesce(br.terminal_theme, b.terminal_theme),
    'terminal_page_bg_color', coalesce(br.terminal_page_bg_color, b.terminal_page_bg_color),
    'terminal_press_bg_color', coalesce(br.terminal_press_bg_color, b.terminal_press_bg_color),
    'terminal_accent_color', coalesce(br.terminal_accent_color, b.terminal_accent_color),
    'terminal_text_color', coalesce(br.terminal_text_color, b.terminal_text_color),
    'terminal_muted_text_color', coalesce(br.terminal_muted_text_color, b.terminal_muted_text_color),
    'terminal_background_image_url', coalesce(br.terminal_background_image_url, b.terminal_background_image_url),
    'terminal_logo_url', coalesce(br.terminal_logo_url, b.terminal_logo_url),
    'terminal_background_overlay', coalesce(br.terminal_background_overlay, b.terminal_background_overlay)
  ) into v_result
  from public.devices d
  join public.branches br on br.id = d.branch_id
  join public.businesses b on b.id = br.business_id
  join public.queue_configurations qc on qc.branch_id = br.id
  join public.services ds on ds.id = d.service_id and ds.branch_id = br.id
  where d.device_token = target_device_token
    and d.device_type = 'ticket_terminal'
    and d.is_active = true
    and br.status = 'active'
    and b.status = 'active'
    and ds.is_active = true
  limit 1;
  return v_result;
end;
$$;

revoke all on function public.get_stub_terminal(uuid) from public;
grant execute on function public.get_stub_terminal(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
