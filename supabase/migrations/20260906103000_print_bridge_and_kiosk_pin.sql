-- QueueDrop print bridge jobs + PIN-protected kiosk exit.
-- The web kiosk creates a durable print job; a device-side Print Bridge claims
-- and completes jobs using only its device token. Kiosk exit PINs are stored hashed.

set local check_function_bodies = off;

create extension if not exists pgcrypto with schema extensions;

alter table public.businesses
  add column if not exists kiosk_exit_pin_hash text;

alter table public.devices
  add column if not exists kiosk_pin_failed_attempts integer not null default 0,
  add column if not exists kiosk_pin_locked_until timestamptz;

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  status text not null default 'pending',
  payload jsonb not null,
  attempt_count integer not null default 0,
  claimed_at timestamptz,
  printed_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint print_jobs_ticket_unique unique (ticket_id),
  constraint print_jobs_status_check check (status in ('pending','printing','printed','failed')),
  constraint print_jobs_attempt_count_check check (attempt_count >= 0 and attempt_count <= 20)
);

alter table public.print_jobs enable row level security;

create index if not exists print_jobs_device_pending_idx
  on public.print_jobs(device_id, status, next_attempt_at, created_at);
create index if not exists print_jobs_branch_created_idx
  on public.print_jobs(branch_id, created_at desc);

-- Dashboard members can inspect print history for their own business; device
-- bridge writes are handled only through security-definer RPCs below.
drop policy if exists print_jobs_business_members_select on public.print_jobs;
create policy print_jobs_business_members_select on public.print_jobs
for select to authenticated
using (public.is_business_member(business_id));

create or replace function public.set_kiosk_exit_pin(target_pin text)
returns void
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_business_id uuid;
  v_role public.user_role;
  v_pin text := btrim(coalesce(target_pin,''));
begin
  select bu.business_id, bu.role
    into v_business_id, v_role
  from public.business_users bu
  where bu.user_id = auth.uid() and bu.is_active = true
  order by bu.created_at
  limit 1;

  if v_business_id is null or v_role not in ('owner','admin') then
    raise exception 'Only an owner or admin can change the kiosk exit PIN';
  end if;
  if v_pin !~ '^[0-9]{4,8}$' then
    raise exception 'Kiosk exit PIN must contain 4 to 8 digits';
  end if;

  update public.businesses
  set kiosk_exit_pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf', 10)),
      updated_at = now()
  where id = v_business_id;

  insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,details)
  values(v_business_id,auth.uid(),'kiosk.exit_pin_updated','business',v_business_id,jsonb_build_object('configured',true));
end;
$$;
revoke all on function public.set_kiosk_exit_pin(text) from public,anon,service_role;
grant execute on function public.set_kiosk_exit_pin(text) to authenticated;

create or replace function public.verify_kiosk_exit_pin(target_device_token uuid, target_pin text)
returns boolean
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_device public.devices%rowtype;
  v_business_id uuid;
  v_hash text;
  v_is_member boolean;
  v_pin text := btrim(coalesce(target_pin,''));
begin
  select d.* into v_device
  from public.devices d
  where d.device_token=target_device_token
    and d.device_type='ticket_terminal'
    and d.is_active=true
  limit 1;
  if v_device.id is null then raise exception 'Terminal not found'; end if;

  select b.business_id into v_business_id from public.branches b where b.id=v_device.branch_id;
  select exists(
    select 1 from public.business_users bu
    where bu.business_id=v_business_id and bu.user_id=auth.uid() and bu.is_active=true
  ) into v_is_member;
  if not coalesce(v_is_member,false) then raise exception 'Active dashboard session required'; end if;

  if v_device.kiosk_pin_locked_until is not null and v_device.kiosk_pin_locked_until > now() then
    raise exception 'Too many attempts. Try again in one minute';
  end if;

  select kiosk_exit_pin_hash into v_hash from public.businesses where id=v_business_id;
  if v_hash is null then raise exception 'Kiosk exit PIN is not configured'; end if;

  if extensions.crypt(v_pin, v_hash) = v_hash then
    update public.devices
      set kiosk_pin_failed_attempts=0, kiosk_pin_locked_until=null, updated_at=now()
    where id=v_device.id;
    return true;
  end if;

  update public.devices
  set kiosk_pin_failed_attempts = kiosk_pin_failed_attempts + 1,
      kiosk_pin_locked_until = case when kiosk_pin_failed_attempts + 1 >= 5 then now() + interval '1 minute' else null end,
      updated_at=now()
  where id=v_device.id;

  return false;
end;
$$;
revoke all on function public.verify_kiosk_exit_pin(uuid,text) from public,anon,service_role;
grant execute on function public.verify_kiosk_exit_pin(uuid,text) to authenticated;

create or replace function public.get_stub_terminal(target_device_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'device_id', d.id,
    'device_name', d.name,
    'branch_id', br.id,
    'branch_name', br.name,
    'business_name', b.name,
    'service_id', s.id,
    'service_name', s.name,
    'queue_prefix', coalesce(nullif(s.queue_prefix, ''), qc.ticket_prefix, 'Q'),
    'stub_mode_enabled', qc.stub_mode_enabled,
    'queue_active', qc.is_active,
    'branch_open', public.is_branch_open_now(br.id),
    'exit_pin_configured', b.kiosk_exit_pin_hash is not null
  ) into v_result
  from public.devices d
  join public.branches br on br.id = d.branch_id
  join public.businesses b on b.id = br.business_id
  join public.queue_configurations qc on qc.branch_id = br.id
  join public.services s on s.id = d.service_id and s.branch_id = br.id
  where d.device_token = target_device_token
    and d.device_type = 'ticket_terminal'
    and d.is_active = true
    and br.status = 'active'
    and b.status = 'active'
    and s.is_active = true
  limit 1;
  return v_result;
end;
$$;
revoke all on function public.get_stub_terminal(uuid) from public;
grant execute on function public.get_stub_terminal(uuid) to anon,authenticated,service_role;

-- Stub issuance remains atomic and now also creates one durable print job.
create or replace function public.issue_stub_ticket(target_device_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_device public.devices%rowtype; v_branch public.branches%rowtype; v_business public.businesses%rowtype;
  v_service public.services%rowtype; v_config public.queue_configurations%rowtype; v_session_date date;
  v_queue_session_id uuid; v_queue_status text; v_customer_session_id uuid; v_session_token uuid;
  v_ticket_number integer; v_display_number text; v_ticket_id uuid; v_position integer; v_prefix text;
  v_print_job_id uuid;
begin
  select * into v_device from public.devices where device_token=target_device_token and device_type='ticket_terminal' and is_active=true limit 1;
  if v_device.id is null or v_device.service_id is null then raise exception 'This QueueDrop terminal is not configured'; end if;
  select * into v_branch from public.branches where id=v_device.branch_id;
  select * into v_business from public.businesses where id=v_branch.business_id;
  select * into v_service from public.services where id=v_device.service_id and branch_id=v_branch.id;
  select * into v_config from public.queue_configurations where branch_id=v_branch.id;
  if v_business.status<>'active' or v_branch.status<>'active' or not coalesce(v_service.is_active,false) then raise exception 'This queue is not available'; end if;
  if not coalesce(v_config.is_active,false) or not coalesce(v_config.stub_mode_enabled,false) then raise exception 'Stub issuing is currently disabled'; end if;
  if not public.is_branch_open_now(v_branch.id) then raise exception 'The branch is currently closed'; end if;
  begin v_session_date := (timezone(v_branch.timezone,now()))::date; exception when others then raise exception 'Branch timezone configuration is invalid'; end;
  insert into public.queue_sessions(branch_id,session_date,status,opened_at) values(v_branch.id,v_session_date,'open',now()) on conflict(branch_id,session_date) do nothing;
  select qs.id,qs.status into v_queue_session_id,v_queue_status from public.queue_sessions qs where qs.branch_id=v_branch.id and qs.session_date=v_session_date for update;
  if v_queue_status<>'open' then raise exception 'The queue is currently closed'; end if;
  insert into public.service_queue_counters(queue_session_id,service_id,current_number)
  values(v_queue_session_id,v_service.id,v_config.starting_number)
  on conflict(queue_session_id,service_id) do update set current_number=public.service_queue_counters.current_number+1,updated_at=now()
  returning current_number into v_ticket_number;
  update public.queue_sessions set current_number=current_number+1 where id=v_queue_session_id;
  v_prefix:=coalesce(nullif(v_service.queue_prefix,''),nullif(v_config.ticket_prefix,''),'Q');
  v_display_number:=v_prefix||lpad(v_ticket_number::text,3,'0');
  insert into public.customer_sessions(customer_id,branch_id,expires_at) values(null,v_branch.id,now()+interval '24 hours') returning id,session_token into v_customer_session_id,v_session_token;
  insert into public.tickets(queue_session_id,branch_id,service_id,customer_id,customer_session_id,ticket_number,display_number,status,source,issued_by_device_id)
  values(v_queue_session_id,v_branch.id,v_service.id,null,v_customer_session_id,v_ticket_number,v_display_number,'waiting','stub_terminal',v_device.id) returning id into v_ticket_id;
  insert into public.ticket_events(ticket_id,event_type,performed_by,notes) values(v_ticket_id,'waiting',null,'Stub issued by QueueDrop terminal '||v_device.name);
  update public.devices set last_seen_at=now(),updated_at=now() where id=v_device.id;
  select count(*)::integer into v_position from public.tickets t where t.queue_session_id=v_queue_session_id and t.service_id=v_service.id and t.status='waiting' and t.ticket_number<=v_ticket_number;

  insert into public.print_jobs(business_id,branch_id,device_id,ticket_id,payload)
  values(
    v_business.id,v_branch.id,v_device.id,v_ticket_id,
    jsonb_build_object(
      'ticketId',v_ticket_id,
      'displayNumber',v_display_number,
      'businessName',v_business.name,
      'branchName',v_branch.name,
      'serviceName',v_service.name,
      'position',v_position,
      'sessionToken',v_session_token,
      'footer','Scan to check your live queue position. Add your mobile number only if you want SMS alerts.'
    )
  ) returning id into v_print_job_id;

  return jsonb_build_object(
    'ticket_id',v_ticket_id,'print_job_id',v_print_job_id,'session_token',v_session_token,
    'display_number',v_display_number,'position',v_position,'status','waiting',
    'business_name',v_business.name,'branch_name',v_branch.name,'service_name',v_service.name
  );
end; $$;
revoke all on function public.issue_stub_ticket(uuid) from public;
grant execute on function public.issue_stub_ticket(uuid) to anon,authenticated,service_role;

create or replace function public.claim_next_print_job(target_device_token uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_device_id uuid;
  v_job public.print_jobs%rowtype;
begin
  select id into v_device_id from public.devices
  where device_token=target_device_token and device_type='ticket_terminal' and is_active=true limit 1;
  if v_device_id is null then raise exception 'Terminal not found or disabled'; end if;

  select * into v_job from public.print_jobs
  where device_id=v_device_id
    and status in ('pending','failed')
    and attempt_count < 5
    and next_attempt_at <= now()
  order by created_at
  for update skip locked
  limit 1;

  if v_job.id is null then
    update public.devices set last_seen_at=now(),updated_at=now() where id=v_device_id;
    return null;
  end if;

  update public.print_jobs
  set status='printing',attempt_count=attempt_count+1,claimed_at=now(),error_message=null,updated_at=now()
  where id=v_job.id;
  update public.devices set last_seen_at=now(),updated_at=now() where id=v_device_id;

  return jsonb_build_object(
    'jobId',v_job.id,
    'ticketId',v_job.ticket_id,
    'payload',v_job.payload,
    'attempt',v_job.attempt_count+1
  );
end;
$$;
revoke all on function public.claim_next_print_job(uuid) from public;
grant execute on function public.claim_next_print_job(uuid) to anon,authenticated,service_role;

create or replace function public.complete_print_job(target_device_token uuid,target_job_id uuid,target_success boolean,target_error text default null)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_device_id uuid;
  v_ticket_id uuid;
  v_attempt integer;
begin
  select id into v_device_id from public.devices
  where device_token=target_device_token and device_type='ticket_terminal' and is_active=true limit 1;
  if v_device_id is null then raise exception 'Terminal not found or disabled'; end if;

  select ticket_id,attempt_count into v_ticket_id,v_attempt
  from public.print_jobs
  where id=target_job_id and device_id=v_device_id and status='printing'
  for update;
  if v_ticket_id is null then return false; end if;

  if target_success then
    update public.print_jobs set status='printed',printed_at=now(),error_message=null,updated_at=now() where id=target_job_id;
    update public.tickets set printed_at=coalesce(printed_at,now()),updated_at=now() where id=v_ticket_id;
  else
    update public.print_jobs
    set status='failed',error_message=left(coalesce(target_error,'Printer error'),500),
        next_attempt_at=now() + make_interval(secs => least(30,greatest(2,v_attempt*2))),updated_at=now()
    where id=target_job_id;
  end if;
  update public.devices set last_seen_at=now(),updated_at=now() where id=v_device_id;
  return true;
end;
$$;
revoke all on function public.complete_print_job(uuid,uuid,boolean,text) from public;
grant execute on function public.complete_print_job(uuid,uuid,boolean,text) to anon,authenticated,service_role;

notify pgrst,'reload schema';

-- Compatibility: older QueueDrop Android wrappers may print immediately from
-- the WebView bridge. Allow them to acknowledge an unclaimed pending job too.
create or replace function public.complete_print_job(target_device_token uuid,target_job_id uuid,target_success boolean,target_error text default null)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_device_id uuid;
  v_ticket_id uuid;
  v_attempt integer;
begin
  select id into v_device_id from public.devices
  where device_token=target_device_token and device_type='ticket_terminal' and is_active=true limit 1;
  if v_device_id is null then raise exception 'Terminal not found or disabled'; end if;

  select ticket_id,attempt_count into v_ticket_id,v_attempt
  from public.print_jobs
  where id=target_job_id and device_id=v_device_id and status in ('pending','printing')
  for update;
  if v_ticket_id is null then return false; end if;

  if target_success then
    update public.print_jobs set status='printed',printed_at=now(),error_message=null,updated_at=now() where id=target_job_id;
    update public.tickets set printed_at=coalesce(printed_at,now()),updated_at=now() where id=v_ticket_id;
  else
    update public.print_jobs
    set status='failed',error_message=left(coalesce(target_error,'Printer error'),500),
        attempt_count=greatest(1,attempt_count),
        next_attempt_at=now() + make_interval(secs => least(30,greatest(2,greatest(1,v_attempt)*2))),updated_at=now()
    where id=target_job_id;
  end if;
  update public.devices set last_seen_at=now(),updated_at=now() where id=v_device_id;
  return true;
end;
$$;
revoke all on function public.complete_print_job(uuid,uuid,boolean,text) from public;
grant execute on function public.complete_print_job(uuid,uuid,boolean,text) to anon,authenticated,service_role;

notify pgrst,'reload schema';
