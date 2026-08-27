set local check_function_bodies = off;

-- Repair schema drift in QueueDrop TEST team management.
-- Earlier migrations are present in migration history, but the actual remote
-- schema is missing the team-profile visibility helper/policy and delete RPC.

-- Team profile visibility:
-- owner/admin -> all members in the same business
-- manager     -> staff sharing one of the manager's assigned branches
-- self        -> own profile
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

-- The stale TEST schema still has the original self-only SELECT policy.
-- Restore the intended scoped team profile policy so the Team page can read
-- the name/email/phone of members the actor is allowed to manage.
drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Scoped users can view team profiles" on public.profiles;
create policy "Scoped users can view team profiles" on public.profiles
  for select to authenticated
  using (public.can_view_team_profile(id));

-- Restore the missing team deletion RPC with the same hierarchy rules used by
-- the current Team UI and manage_team_member RPC.
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

-- Ask PostgREST to refresh immediately so newly restored RPCs/policies are
-- available without waiting for the schema cache refresh cycle.
notify pgrst, 'reload schema';
