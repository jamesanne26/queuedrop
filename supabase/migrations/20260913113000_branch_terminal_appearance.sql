-- QueueDrop branch-specific terminal appearance.
-- Branch values override business defaults. Null branch values inherit the business appearance.

set local check_function_bodies = off;

alter table public.branches
  add column if not exists terminal_theme text,
  add column if not exists terminal_page_bg_color text,
  add column if not exists terminal_press_bg_color text,
  add column if not exists terminal_accent_color text,
  add column if not exists terminal_text_color text,
  add column if not exists terminal_muted_text_color text,
  add column if not exists terminal_background_image_url text,
  add column if not exists terminal_logo_url text,
  add column if not exists terminal_background_overlay integer;

alter table public.branches drop constraint if exists branches_terminal_theme_check;
alter table public.branches add constraint branches_terminal_theme_check
  check (terminal_theme is null or terminal_theme in ('classic','ocean','midnight','sunset','rose','violet','cafe','clean','tropical','dark'));

alter table public.branches drop constraint if exists branches_terminal_overlay_check;
alter table public.branches add constraint branches_terminal_overlay_check
  check (terminal_background_overlay is null or terminal_background_overlay between 0 and 90);

alter table public.branches drop constraint if exists branches_terminal_page_bg_color_check;
alter table public.branches add constraint branches_terminal_page_bg_color_check
  check (terminal_page_bg_color is null or terminal_page_bg_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.branches drop constraint if exists branches_terminal_press_bg_color_check;
alter table public.branches add constraint branches_terminal_press_bg_color_check
  check (terminal_press_bg_color is null or terminal_press_bg_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.branches drop constraint if exists branches_terminal_accent_color_check;
alter table public.branches add constraint branches_terminal_accent_color_check
  check (terminal_accent_color is null or terminal_accent_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.branches drop constraint if exists branches_terminal_text_color_check;
alter table public.branches add constraint branches_terminal_text_color_check
  check (terminal_text_color is null or terminal_text_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.branches drop constraint if exists branches_terminal_muted_text_color_check;
alter table public.branches add constraint branches_terminal_muted_text_color_check
  check (terminal_muted_text_color is null or terminal_muted_text_color ~ '^#[0-9A-Fa-f]{6}$');

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
    'exit_pin_configured', b.kiosk_exit_pin_hash is not null,
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
