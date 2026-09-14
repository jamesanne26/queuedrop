-- QueueDrop role branch-assignment rules.
-- Branch access is assigned from Settings -> Branches -> Branch Users.
-- all_branches: zero or many assignments.
-- selected_branches / own_branch_only: zero or one assignment.
create or replace function public.manage_team_member_with_business_role(
  target_user_id uuid,
  target_role_id uuid,
  target_branch_ids uuid[] default '{}'::uuid[],
  target_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_business_id uuid;
  actor_role public.user_role;
  actor_can_manage_team boolean;
  target_role public.roles%rowtype;
  membership_id uuid;
  effective_branch_ids uuid[] := coalesce(target_branch_ids, '{}'::uuid[]);
  existing_role public.user_role;
begin
  select bu.business_id, bu.role, coalesce(bu.can_manage_team, false)
    into actor_business_id, actor_role, actor_can_manage_team
  from public.business_users bu
  where bu.user_id = auth.uid() and bu.is_active = true
  limit 1;

  if actor_business_id is null or not (actor_role in ('owner','admin') or actor_can_manage_team) then
    raise exception 'You do not have permission to manage employees.';
  end if;
  if target_user_id = auth.uid() then raise exception 'You cannot change your own team access from this screen.'; end if;

  select * into target_role from public.roles r where r.id = target_role_id and r.business_id = actor_business_id;
  if target_role.id is null then raise exception 'Role was not found.'; end if;
  if target_role.base_role in ('owner','admin') then raise exception 'Owner and Administrator roles cannot be assigned from employee management.'; end if;

  select bu.role into existing_role from public.business_users bu where bu.business_id = actor_business_id and bu.user_id = target_user_id;
  if existing_role in ('owner','admin') then raise exception 'Owner and admin accounts are protected.'; end if;

  if target_role.branch_scope in ('own_branch_only','selected_branches') and coalesce(cardinality(effective_branch_ids), 0) > 1 then
    raise exception 'This role can be assigned to one branch only.';
  end if;

  if exists (
    select 1 from unnest(effective_branch_ids) requested(branch_id)
    where not exists (select 1 from public.branches b where b.id = requested.branch_id and b.business_id = actor_business_id)
  ) then raise exception 'One or more selected branches do not belong to this business.'; end if;

  if actor_role not in ('owner','admin') and exists (
    select 1 from unnest(effective_branch_ids) requested(branch_id)
    where not exists (select 1 from public.branch_users actor_branch where actor_branch.user_id = auth.uid() and actor_branch.branch_id = requested.branch_id)
  ) then raise exception 'You can assign employees only to your own branches.'; end if;

  insert into public.business_users(business_id, user_id, role, role_id, custom_role_name, is_active)
  values(actor_business_id, target_user_id, target_role.base_role, target_role.id, target_role.name, target_active)
  on conflict (business_id, user_id) do update set role=excluded.role, role_id=excluded.role_id, custom_role_name=excluded.custom_role_name, is_active=excluded.is_active
  returning id into membership_id;

  delete from public.branch_users bru using public.branches b
  where bru.branch_id=b.id and bru.user_id=target_user_id and b.business_id=actor_business_id;

  insert into public.branch_users(branch_id,user_id)
  select distinct requested.branch_id,target_user_id from unnest(effective_branch_ids) requested(branch_id)
  on conflict (branch_id,user_id) do nothing;

  perform public.sync_business_user_role_permissions(membership_id);
  return membership_id;
end;
$$;
revoke all on function public.manage_team_member_with_business_role(uuid, uuid, uuid[], boolean) from public, anon, service_role;
grant execute on function public.manage_team_member_with_business_role(uuid, uuid, uuid[], boolean) to authenticated;
