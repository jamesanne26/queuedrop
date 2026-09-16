-- Restore the branch assignment invariant for legacy users created before
-- branch selection became required in the Add User flow.
-- Only own-branch roles with zero assignments are repaired. We choose the
-- oldest active branch in the same business (falling back to the oldest branch).

insert into public.branch_users (user_id, branch_id)
select
  bu.user_id,
  coalesce(active_branch.id, any_branch.id) as branch_id
from public.business_users bu
left join public.roles r on r.id = bu.role_id
left join lateral (
  select b.id
  from public.branches b
  where b.business_id = bu.business_id
    and b.status = 'active'
  order by b.created_at asc
  limit 1
) active_branch on true
left join lateral (
  select b.id
  from public.branches b
  where b.business_id = bu.business_id
  order by b.created_at asc
  limit 1
) any_branch on true
where bu.is_active = true
  and coalesce(
    r.branch_scope::text,
    case when bu.role::text = 'staff' then 'own_branch_only' else 'all_branches' end
  ) = 'own_branch_only'
  and coalesce(active_branch.id, any_branch.id) is not null
  and not exists (
    select 1
    from public.branch_users existing
    where existing.user_id = bu.user_id
  )
on conflict do nothing;
