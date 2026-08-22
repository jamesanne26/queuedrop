set local check_function_bodies = off;

-- Milestone 6: owner/admin team management with branch-scoped access.
alter table public.business_users
  add column if not exists is_active boolean not null default true;

alter table public.profiles
  add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is distinct from u.email;

create index if not exists idx_profiles_email_lower
  on public.profiles (lower(email))
  where email is not null;

create index if not exists idx_business_users_active
  on public.business_users (business_id, is_active);

-- Keep profiles synchronized with Auth users, including email for business team management.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    new.email
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    email = excluded.email,
    updated_at = now();

  return new;
end;
$$;

-- Inactive memberships must not grant business or branch access.
create or replace function public.is_business_member(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.business_users bu
    where bu.business_id = target_business_id
      and bu.user_id = auth.uid()
      and bu.is_active = true
  );
$$;

create or replace function public.is_business_admin(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.business_users bu
    where bu.business_id = target_business_id
      and bu.user_id = auth.uid()
      and bu.is_active = true
      and bu.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_branch_member(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.branch_users bru
    join public.branches b on b.id = bru.branch_id
    join public.business_users bu
      on bu.business_id = b.business_id
     and bu.user_id = bru.user_id
    where bru.branch_id = target_branch_id
      and bru.user_id = auth.uid()
      and bu.is_active = true
  );
$$;

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
        or public.is_business_admin(b.business_id)
      )
  );
$$;

-- Owners/admins may view profile details of users belonging to their business.
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
        and actor_bu.role in ('owner', 'admin')
    );
$$;

revoke all on function public.can_view_team_profile(uuid) from public, anon, service_role;
grant execute on function public.can_view_team_profile(uuid) to authenticated;

drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Scoped users can view team profiles" on public.profiles;
create policy "Scoped users can view team profiles" on public.profiles
  for select to authenticated
  using (public.can_view_team_profile(id));

-- Atomic business-side membership and branch assignment management.
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
  v_existing public.business_users%rowtype;
  v_membership_id uuid;
  v_existed boolean := false;
begin
  select bu.business_id
  into v_actor_business_id
  from public.business_users bu
  where bu.user_id = auth.uid()
    and bu.is_active = true
    and bu.role in ('owner', 'admin')
  order by case when bu.role = 'owner' then 0 else 1 end
  limit 1;

  if v_actor_business_id is null then
    raise exception 'Only active business owners or admins can manage team members';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot change your own team access from this screen';
  end if;

  if target_role = 'owner'::public.user_role then
    raise exception 'Owner role cannot be assigned through team management';
  end if;

  if not exists (select 1 from public.profiles p where p.id = target_user_id) then
    raise exception 'Target user profile does not exist';
  end if;

  select * into v_existing
  from public.business_users bu
  where bu.business_id = v_actor_business_id
    and bu.user_id = target_user_id;

  v_existed := found;
  if v_existed and v_existing.role = 'owner'::public.user_role then
    raise exception 'The business owner cannot be modified';
  end if;

  if target_active
     and target_role in ('manager'::public.user_role, 'staff'::public.user_role)
     and coalesce(cardinality(target_branch_ids), 0) = 0 then
    raise exception 'Manager and staff roles require at least one assigned branch';
  end if;

  if exists (
    select 1
    from unnest(coalesce(target_branch_ids, '{}'::uuid[])) as requested(branch_id)
    where not exists (
      select 1 from public.branches b
      where b.id = requested.branch_id
        and b.business_id = v_actor_business_id
    )
  ) then
    raise exception 'One or more selected branches do not belong to this business';
  end if;

  insert into public.business_users (business_id, user_id, role, is_active)
  values (v_actor_business_id, target_user_id, target_role, target_active)
  on conflict (business_id, user_id) do update set
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
    business_id, user_id, action, entity_type, entity_id, details
  ) values (
    v_actor_business_id,
    auth.uid(),
    case when v_existed then 'team.member_updated' else 'team.member_added' end,
    'business_user',
    v_membership_id,
    jsonb_build_object(
      'target_user_id', target_user_id,
      'role', target_role,
      'is_active', target_active,
      'branch_ids', coalesce(target_branch_ids, '{}'::uuid[])
    )
  );

  return v_membership_id;
end;
$$;

revoke all on function public.manage_team_member(uuid, public.user_role, uuid[], boolean)
  from public, anon, service_role;
grant execute on function public.manage_team_member(uuid, public.user_role, uuid[], boolean)
  to authenticated;
