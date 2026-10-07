create table public.platform_public_contact (
  id boolean primary key default true check (id),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$')
);
alter table public.platform_public_contact enable row level security;
-- This table deliberately contains only an explicitly public phone number.
grant select on public.platform_public_contact to anon, authenticated;
grant insert, update on public.platform_public_contact to authenticated;
grant all on public.platform_public_contact to service_role;
create policy "Public contact is public" on public.platform_public_contact for select to anon, authenticated using (true);
create policy "Active platform owner inserts contact" on public.platform_public_contact for insert to authenticated
with check (exists (select 1 from public.system_owners o where o.user_id = (select auth.uid()) and o.is_active));
create policy "Active platform owner updates contact" on public.platform_public_contact for update to authenticated
using (exists (select 1 from public.system_owners o where o.user_id = (select auth.uid()) and o.is_active))
with check (exists (select 1 from public.system_owners o where o.user_id = (select auth.uid()) and o.is_active));

create table public.branch_tv_settings (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  service_count integer not null default 4 check (service_count between 1 and 6),
  service_ids uuid[] not null default '{}',
  check (cardinality(service_ids) <= service_count)
);
alter table public.branch_tv_settings enable row level security;
grant select, insert, update on public.branch_tv_settings to authenticated;
grant all on public.branch_tv_settings to service_role;
create policy "Visible branch TV settings" on public.branch_tv_settings for select to authenticated
using (exists (select 1 from public.branches b where b.id = branch_id));
create policy "Business admins insert TV settings" on public.branch_tv_settings for insert to authenticated
with check (exists (select 1 from public.branches b where b.id = branch_id and public.is_business_admin(b.business_id)));
create policy "Business admins update TV settings" on public.branch_tv_settings for update to authenticated
using (exists (select 1 from public.branches b where b.id = branch_id and public.is_business_admin(b.business_id)))
with check (exists (select 1 from public.branches b where b.id = branch_id and public.is_business_admin(b.business_id)));

create function public.validate_branch_tv_services() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if cardinality(new.service_ids) <> (select count(distinct id) from unnest(new.service_ids) id)
    or exists (select 1 from unnest(new.service_ids) candidate(service_id) where not exists (
      select 1 from public.services s where s.id = candidate.service_id and s.branch_id = new.branch_id and s.is_active
    )) then
    raise exception 'Choose unique active services from this branch';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_branch_tv_services() from public, anon, authenticated, service_role;
create trigger validate_tv_services before insert or update on public.branch_tv_settings
for each row execute function public.validate_branch_tv_services();
notify pgrst, 'reload schema';
