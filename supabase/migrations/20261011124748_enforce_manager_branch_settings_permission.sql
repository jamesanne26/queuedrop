begin;

create or replace function public.can_manage_branch_settings(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.branches b
    where b.id = target_branch_id
      and (
        public.is_business_admin(b.business_id)
        or exists (
          select 1
          from public.business_users bu
          join public.branch_users bru
            on bru.user_id = bu.user_id
           and bru.branch_id = b.id
          join public.roles r
            on r.id = bu.role_id
           and r.business_id = bu.business_id
           and r.base_role = 'manager'
          join public.role_permissions rp
            on rp.role_id = r.id
           and rp.permission_code = 'manage_settings'
          where bu.business_id = b.business_id
            and bu.user_id = auth.uid()
            and bu.is_active = true
            and bu.role = 'manager'
        )
      )
  );
$function$;

revoke all on function public.can_manage_branch_settings(uuid)
  from public, anon, service_role;

grant execute on function public.can_manage_branch_settings(uuid)
  to authenticated;

commit;