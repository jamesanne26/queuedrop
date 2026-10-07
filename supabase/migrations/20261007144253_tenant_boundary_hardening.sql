-- A stale branch assignment must never revive disabled/removed tenant access.
create or replace function public.is_branch_member(target_branch_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.branch_users assignment
    join public.branches branch on branch.id = assignment.branch_id
    join public.business_users member
      on member.business_id = branch.business_id and member.user_id = assignment.user_id
    where assignment.branch_id = target_branch_id
      and assignment.user_id = auth.uid() and member.is_active = true
  );
$$;
revoke all on function public.is_branch_member(uuid) from public, anon;
grant execute on function public.is_branch_member(uuid) to authenticated, service_role;

-- RLS protects the parent row; these checks protect referenced tenant IDs too.
create or replace function public.validate_tenant_reference()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare tenant uuid;
begin
  if tg_table_name = 'business_users' then
    if new.role_id is not null and not exists (
      select 1 from public.roles where id = new.role_id and business_id = new.business_id
    ) then raise exception 'Role does not belong to this business.' using errcode='23514'; end if;
  else
    select business_id into tenant from public.branches where id = new.branch_id;
    if tenant is null then raise exception 'Invalid branch.' using errcode='23514'; end if;
    if tg_table_name = 'branch_users' then
      if not exists (select 1 from public.business_users where business_id=tenant and user_id=new.user_id)
      then raise exception 'Branch user does not belong to this business.' using errcode='23514'; end if;
    elsif tg_table_name = 'devices' then
      if new.service_id is not null and not exists (select 1 from public.services where id=new.service_id and branch_id=new.branch_id)
      then raise exception 'Device service does not belong to this branch.' using errcode='23514'; end if;
    elsif tg_table_name = 'branch_service_catalog' then
      if not exists (select 1 from public.business_services where id=new.business_service_id and business_id=tenant)
        or (new.service_id is not null and not exists (select 1 from public.services where id=new.service_id and branch_id=new.branch_id))
      then raise exception 'Catalog service does not belong to this business and branch.' using errcode='23514'; end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_tenant_reference() from public, anon, authenticated;
drop trigger if exists validate_tenant_reference on public.branch_users;
create trigger validate_tenant_reference before insert or update of branch_id,user_id on public.branch_users for each row execute function public.validate_tenant_reference();
drop trigger if exists validate_tenant_reference on public.devices;
create trigger validate_tenant_reference before insert or update of branch_id,service_id on public.devices for each row execute function public.validate_tenant_reference();
drop trigger if exists validate_tenant_reference on public.branch_service_catalog;
create trigger validate_tenant_reference before insert or update of branch_id,business_service_id,service_id on public.branch_service_catalog for each row execute function public.validate_tenant_reference();
drop trigger if exists validate_tenant_reference on public.business_users;
create trigger validate_tenant_reference before insert or update of business_id,role_id on public.business_users for each row execute function public.validate_tenant_reference();

-- Billing prices, limits and payment state are written only by trusted server paths.
drop policy if exists "Business admins can create subscription" on public.business_subscriptions;
drop policy if exists "Business admins can update subscription" on public.business_subscriptions;
drop policy if exists "Business admins can create subscription orders" on public.subscription_orders;
revoke insert,update,delete on public.business_subscriptions, public.subscription_orders from public,anon,authenticated;
grant select,insert,update,delete on public.business_subscriptions, public.subscription_orders to service_role;

alter function public.set_updated_at() set search_path = public, pg_temp;
-- Legacy employee configuration is authenticated, never an anonymous endpoint.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='set_employee_access'
  loop
    execute format('revoke execute on function %s from public, anon',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;
-- Trigger functions are not public RPCs; executing a trigger does not require this grant.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prorettype='trigger'::regtype
  loop execute format('revoke execute on function %s from public, anon, authenticated',f.signature); end loop;
end $$;
notify pgrst, 'reload schema';
