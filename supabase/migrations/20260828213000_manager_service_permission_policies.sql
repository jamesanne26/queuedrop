-- Role-permission matrix follow-up:
-- allow a branch-assigned manager with can_manage_services=true to mutate
-- services for that assigned branch. Owner/admin access remains covered by
-- the existing business-admin service policies.

create or replace function public.can_manage_services_for_branch(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.branches b
    join public.business_users bu
      on bu.business_id = b.business_id
     and bu.user_id = auth.uid()
     and bu.is_active = true
    where b.id = target_branch_id
      and (
        bu.role in ('owner', 'admin')
        or (
          bu.role = 'manager'
          and bu.can_manage_services = true
          and exists (
            select 1
            from public.branch_users bru
            where bru.branch_id = b.id
              and bru.user_id = auth.uid()
          )
        )
      )
  );
$$;
revoke all on function public.can_manage_services_for_branch(uuid) from public, anon, service_role;
grant execute on function public.can_manage_services_for_branch(uuid) to authenticated;
drop policy if exists "Managers with permission can create services" on public.services;
create policy "Managers with permission can create services" on public.services
  for insert to authenticated
  with check (public.can_manage_services_for_branch(branch_id));
drop policy if exists "Managers with permission can update services" on public.services;
create policy "Managers with permission can update services" on public.services
  for update to authenticated
  using (public.can_manage_services_for_branch(branch_id))
  with check (public.can_manage_services_for_branch(branch_id));
drop policy if exists "Managers with permission can delete services" on public.services;
create policy "Managers with permission can delete services" on public.services
  for delete to authenticated
  using (public.can_manage_services_for_branch(branch_id));
