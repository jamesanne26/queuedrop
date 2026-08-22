set local check_function_bodies = off;

-- QueueDrop team hierarchy:
-- owner/admin -> manage manager + staff business-wide
-- manager     -> manage staff only inside manager-assigned branches
-- staff       -> no team management

create or replace function public.can_view_team_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_user_id = auth.uid()
    or exists (
      select 1
      from public.business_users target_bu
      join public.business_users actor_bu
        on actor_bu.business_id = target_bu.business_id
      where target_bu.user_id = target_user_id
        and actor_bu.user_id = auth.uid()
        and actor_bu.is_active = true
        and (
          actor_bu.role in ('owner', 'admin')
          or (
            actor_bu.role = 'manager'
            and target_bu.role = 'staff'
            and exists (
              select 1
              from public.branch_users actor_branch
              join public.branch_users target_branch
                on target_branch.branch_id = actor_branch.branch_id
              where actor_branch.user_id = auth.uid()
                and target_branch.user_id = target_user_id
            )
          )
        )
    );
$$;

revoke all on function public.can_view_team_profile(uuid)
  from public, anon, service_role;
grant execute on function public.can_view_team_profile(uuid)
  to authenticated;

create or replace function public.manage_team_member(
  target_user_id uuid,
  target_role public.user_role,
  target_branch_ids uuid[] default '{}'::uuid[],
  target_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_business_id uuid;
  v_actor_role public.user_role;
  v_existing public.business_users%rowtype;
  v_membership_id uuid;
  v_existed boolean := false;
begin
  select bu.business_id, bu.role
    into v_actor_business_id, v_actor_role
  from public.business_users bu
  where bu.user_id = auth.uid()
    and bu.is_active = true
    and bu.role in ('owner', 'admin', 'manager')
  order by
    case
      when bu.role = 'owner' then 0
      when bu.role = 'admin' then 1
      else 2
    end
  limit 1;

  if v_actor_business_id is null then
    raise exception 'You do not have permission to manage team members';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot change your own team access from this screen';
  end if;

  if target_role in ('owner'::public.user_role, 'admin'::public.user_role) then
    raise exception 'Owner and admin roles cannot be assigned from this screen';
  end if;

  if v_actor_role = 'manager'::public.user_role
     and target_role <> 'staff'::public.user_role then
    raise exception 'Managers can manage staff accounts only';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
  ) then
    raise exception 'Target user profile does not exist';
  end if;

  select *
    into v_existing
  from public.business_users bu
  where bu.business_id = v_actor_business_id
    and bu.user_id = target_user_id;

  v_existed := found;

  if v_existed
     and v_existing.role in ('owner'::public.user_role, 'admin'::public.user_role) then
    raise exception 'Owner and admin accounts are protected';
  end if;

  if v_actor_role = 'manager'::public.user_role
     and v_existed
     and v_existing.role <> 'staff'::public.user_role then
    raise exception 'Managers can modify staff accounts only';
  end if;

  if target_active
     and target_role in ('manager'::public.user_role, 'staff'::public.user_role)
     and coalesce(cardinality(target_branch_ids), 0) = 0 then
    raise exception 'Manager and staff roles require at least one assigned branch';
  end if;

  if exists (
    select 1
    from unnest(
      coalesce(target_branch_ids, '{}'::uuid[])
    ) as requested(branch_id)
    where not exists (
      select 1
      from public.branches b
      where b.id = requested.branch_id
        and b.business_id = v_actor_business_id
    )
  ) then
    raise exception 'One or more selected branches do not belong to this business';
  end if;

  if v_actor_role = 'manager'::public.user_role
     and exists (
       select 1
       from unnest(
         coalesce(target_branch_ids, '{}'::uuid[])
       ) as requested(branch_id)
       where not exists (
         select 1
         from public.branch_users actor_branch
         where actor_branch.user_id = auth.uid()
           and actor_branch.branch_id = requested.branch_id
       )
     ) then
    raise exception 'Managers can assign staff only to their own branches';
  end if;

  if v_actor_role = 'manager'::public.user_role
     and v_existed
     and not exists (
       select 1
       from public.branch_users actor_branch
       join public.branch_users target_branch
         on target_branch.branch_id = actor_branch.branch_id
       where actor_branch.user_id = auth.uid()
         and target_branch.user_id = target_user_id
     ) then
    raise exception 'This staff member is outside your assigned branches';
  end if;

  insert into public.business_users (
    business_id,
    user_id,
    role,
    is_active
  )
  values (
    v_actor_business_id,
    target_user_id,
    target_role,
    target_active
  )
  on conflict (business_id, user_id)
  do update set
    role = excluded.role,
    is_active = excluded.is_active
  returning id into v_membership_id;

  delete from public.branch_users bru
  using public.branches b
  where bru.branch_id = b.id
    and bru.user_id = target_user_id
    and b.business_id = v_actor_business_id;

  if coalesce(cardinality(target_branch_ids), 0) > 0 then
    insert into public.branch_users (branch_id, user_id)
    select distinct requested.branch_id, target_user_id
    from unnest(target_branch_ids) as requested(branch_id)
    on conflict (branch_id, user_id) do nothing;
  end if;

  insert into public.audit_logs (
    business_id,
    user_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    v_actor_business_id,
    auth.uid(),
    case
      when v_existed then 'team.member_updated'
      else 'team.member_added'
    end,
    'business_user',
    v_membership_id,
    jsonb_build_object(
      'target_user_id', target_user_id,
      'actor_role', v_actor_role,
      'role', target_role,
      'is_active', target_active,
      'branch_ids',
      coalesce(target_branch_ids, '{}'::uuid[])
    )
  );

  return v_membership_id;
end;
$$;

revoke all on function public.manage_team_member(
  uuid,
  public.user_role,
  uuid[],
  boolean
) from public, anon, service_role;

grant execute on function public.manage_team_member(
  uuid,
  public.user_role,
  uuid[],
  boolean
) to authenticated;

create or replace function public.delete_team_member(
  target_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_business_id uuid;
  v_actor_role public.user_role;
  v_target public.business_users%rowtype;
  v_membership_id uuid;
begin
  select bu.business_id, bu.role
    into v_actor_business_id, v_actor_role
  from public.business_users bu
  where bu.user_id = auth.uid()
    and bu.is_active = true
    and bu.role in ('owner', 'admin', 'manager')
  order by
    case
      when bu.role = 'owner' then 0
      when bu.role = 'admin' then 1
      else 2
    end
  limit 1;

  if v_actor_business_id is null then
    raise exception 'You do not have permission to delete team members';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot delete your own account from this screen';
  end if;

  select *
    into v_target
  from public.business_users bu
  where bu.business_id = v_actor_business_id
    and bu.user_id = target_user_id;

  if not found then
    raise exception 'Team member was not found';
  end if;

  if v_target.role in ('owner'::public.user_role, 'admin'::public.user_role) then
    raise exception 'Owner and admin accounts are protected';
  end if;

  if v_actor_role = 'manager'::public.user_role then
    if v_target.role <> 'staff'::public.user_role then
      raise exception 'Managers can delete staff accounts only';
    end if;

    if not exists (
      select 1
      from public.branch_users actor_branch
      join public.branch_users target_branch
        on target_branch.branch_id = actor_branch.branch_id
      where actor_branch.user_id = auth.uid()
        and target_branch.user_id = target_user_id
    ) then
      raise exception 'This staff member is outside your assigned branches';
    end if;
  end if;

  v_membership_id := v_target.id;

  delete from public.branch_users bru
  using public.branches b
  where bru.branch_id = b.id
    and bru.user_id = target_user_id
    and b.business_id = v_actor_business_id;

  delete from public.business_users bu
  where bu.id = v_membership_id;

  insert into public.audit_logs (
    business_id,
    user_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    v_actor_business_id,
    auth.uid(),
    'team.member_deleted',
    'business_user',
    v_membership_id,
    jsonb_build_object(
      'target_user_id', target_user_id,
      'actor_role', v_actor_role,
      'target_role', v_target.role
    )
  );

  return target_user_id;
end;
$$;

revoke all on function public.delete_team_member(uuid)
  from public, anon, service_role;

grant execute on function public.delete_team_member(uuid)
  to authenticated;
