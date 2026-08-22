set local check_function_bodies = off;

-- Queue operations are business-wide only for owner/admin.
-- Managers and staff must be explicitly assigned through branch_users.
create or replace function public.can_operate_branch(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.branches b
    where b.id = target_branch_id
      and (
        public.is_branch_member(b.id)
        or exists (
          select 1
          from public.business_users bu
          where bu.business_id = b.business_id
            and bu.user_id = auth.uid()
            and bu.role in ('owner', 'admin')
        )
      )
  );
$$;

revoke all on function public.can_operate_branch(uuid) from public, anon, service_role;
grant execute on function public.can_operate_branch(uuid) to authenticated;

-- Tighten branch-scoped reads. Owner/admin retain business-wide visibility;
-- manager/staff visibility is derived from branch_users assignments.
drop policy if exists "Business members can view branches" on public.branches;
create policy "Scoped members can view branches" on public.branches
  for select to authenticated
  using (
    public.is_business_admin(business_id)
    or public.is_branch_member(id)
  );

drop policy if exists "Business members can view services" on public.services;
create policy "Scoped members can view services" on public.services
  for select to authenticated
  using (
    exists (
      select 1
      from public.branches b
      where b.id = services.branch_id
        and (
          public.is_business_admin(b.business_id)
          or public.is_branch_member(b.id)
        )
    )
  );

drop policy if exists "Business members can view queue configurations" on public.queue_configurations;
create policy "Scoped members can view queue configurations" on public.queue_configurations
  for select to authenticated
  using (
    exists (
      select 1
      from public.branches b
      where b.id = queue_configurations.branch_id
        and (
          public.is_business_admin(b.business_id)
          or public.is_branch_member(b.id)
        )
    )
  );

drop policy if exists "Business members can view branch users" on public.branch_users;
create policy "Scoped members can view branch users" on public.branch_users
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.branches b
      where b.id = branch_users.branch_id
        and public.is_business_admin(b.business_id)
    )
  );

-- Owners/admins can inspect tickets across their business even if they are not
-- individually listed in branch_users. Manager/staff remain branch-scoped.
drop policy if exists "Branch members can view tickets" on public.tickets;
create policy "Scoped operators can view tickets" on public.tickets
  for select to authenticated
  using (
    public.is_branch_member(branch_id)
    or exists (
      select 1 from public.branches b
      where b.id = tickets.branch_id
        and public.is_business_admin(b.business_id)
    )
  );
