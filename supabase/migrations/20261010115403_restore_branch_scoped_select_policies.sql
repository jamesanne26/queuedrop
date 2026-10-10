-- Keep branch-scoped staff and managers inside their assigned branches.
-- Owners and admins retain tenant-wide visibility, matching Production's policy.
drop policy if exists "Business members can view branch users" on public.branch_users;
drop policy if exists "Scoped members can view branch users" on public.branch_users;
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

drop policy if exists "Business members can view branches" on public.branches;
drop policy if exists "Scoped members can view branches" on public.branches;
create policy "Scoped members can view branches" on public.branches
  for select to authenticated
  using (
    public.is_business_admin(business_id)
    or public.is_branch_member(id)
  );

drop policy if exists "Business members can view services" on public.services;
drop policy if exists "Scoped members can view services" on public.services;
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
drop policy if exists "Scoped members can view queue configurations" on public.queue_configurations;
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

drop policy if exists "Business members can view operating hours" on public.operating_hours;
drop policy if exists "Scoped members can view operating hours" on public.operating_hours;
create policy "Scoped members can view operating hours" on public.operating_hours
  for select to authenticated
  using (
    exists (
      select 1
      from public.branches b
      where b.id = operating_hours.branch_id
        and (
          public.is_business_admin(b.business_id)
          or public.is_branch_member(b.id)
        )
    )
  );

drop policy if exists "Business members can view notifications" on public.notifications;
drop policy if exists "Scoped members can view notifications" on public.notifications;
create policy "Scoped members can view notifications" on public.notifications
  for select to authenticated
  using (
    is_business_admin(business_id)
    or (branch_id is not null and is_branch_member(branch_id))
  );

drop policy if exists "Branch members can view tickets" on public.tickets;
drop policy if exists "Scoped operators can view tickets" on public.tickets;
create policy "Scoped operators can view tickets" on public.tickets
  for select to authenticated
  using (
    is_branch_member(branch_id)
    or exists (
      select 1
      from public.branches b
      where b.id = tickets.branch_id
        and is_business_admin(b.business_id)
    )
  );
