-- Supabase projects can have broader default table grants. RLS remains enabled,
-- and explicit privileges restrict the newly introduced API surface.
revoke all on public.platform_public_contact from public, anon, authenticated;
grant select on public.platform_public_contact to anon, authenticated;
grant insert, update on public.platform_public_contact to authenticated;
revoke all on public.branch_tv_settings from public, anon, authenticated;
grant select, insert, update on public.branch_tv_settings to authenticated;
notify pgrst, 'reload schema';
