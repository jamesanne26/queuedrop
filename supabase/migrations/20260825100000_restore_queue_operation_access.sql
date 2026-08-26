-- QueueDrop: restore the branch-operation authorization helper used by queue RPCs.
-- This keeps owner/admin business-wide access while managers/staff require branch_users membership.
set local check_function_bodies = off;

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

revoke all on function public.can_operate_branch(uuid)
from public, anon, service_role;

grant execute on function public.can_operate_branch(uuid)
to authenticated;

notify pgrst, 'reload schema';
