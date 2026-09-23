-- Keep latency-sensitive dashboard terminal operations to one browser/database
-- round trip while retaining all authorization checks inside Postgres.

set local check_function_bodies = off;

create or replace function public.dashboard_issue_test_stub(
  target_branch_id uuid,
  target_service_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_business_id uuid;
  v_role public.user_role;
  v_device_token uuid;
  v_issued jsonb;
begin
  if auth.uid() is null then
    raise exception 'Your session expired. Sign in again and retry';
  end if;

  select br.business_id, bu.role
    into v_business_id, v_role
  from public.branches br
  join public.business_users bu
    on bu.business_id = br.business_id
   and bu.user_id = auth.uid()
   and bu.is_active = true
  where br.id = target_branch_id
  limit 1;

  if v_business_id is null then
    raise exception 'The selected branch is not available to this business';
  end if;
  if v_role not in ('owner','admin') then
    raise exception 'Get test stub is available only to client administrators';
  end if;
  if not exists (
    select 1 from public.services s
    where s.id = target_service_id
      and s.branch_id = target_branch_id
      and s.is_active = true
  ) then
    raise exception 'Selected service is not available for this client';
  end if;

  select d.device_token into v_device_token
  from public.devices d
  where d.branch_id = target_branch_id
    and d.service_id = target_service_id
    and d.device_type = 'ticket_terminal'
    and d.is_active = true
  order by d.created_at
  limit 1;

  if v_device_token is null then
    insert into public.devices(branch_id,service_id,name,device_type,is_active)
    values(target_branch_id,target_service_id,'Queue View Simulator','ticket_terminal',true)
    returning device_token into v_device_token;
  end if;

  v_issued := public.issue_stub_ticket_for_service(v_device_token,target_service_id);
  return v_issued || jsonb_build_object('service_id',target_service_id);
end;
$$;

revoke all on function public.dashboard_issue_test_stub(uuid,uuid) from public,anon,service_role;
grant execute on function public.dashboard_issue_test_stub(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
