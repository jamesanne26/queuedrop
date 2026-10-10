-- QueueDrop reliability. Apply to TEST first; this migration never changes production routing.
create or replace function public.format_queue_number(target_number integer)
returns text language sql immutable strict set search_path=public,pg_temp as $$
  select lpad(target_number::text, greatest(3,length(target_number::text)), '0');
$$;

-- Repair all existing issuance functions without replacing unrelated permission fixes.
do $$
declare f record; definition text; repaired text;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.prosrc ~ 'lpad\(v_ticket_number'
  loop
    definition := pg_get_functiondef(f.oid);
    repaired := regexp_replace(definition,
      'lpad\(v_ticket_number::text,\s*3,\s*''0''\)', 'public.format_queue_number(v_ticket_number)', 'g');
    if repaired=definition then raise exception 'Unrecognized queue number formatter'; end if;
    execute repaired;
  end loop;
end $$;

-- Calculate the end of the operating session, including shifts across midnight.
create or replace function public.ticket_queue_deadline(target_branch_id uuid,target_joined_at timestamptz)
returns timestamptz language plpgsql stable set search_path=public,pg_temp as $$
declare zone text; joined_local timestamp; session_day date; hours public.operating_hours%rowtype;
begin
  select timezone into zone from public.branches where id=target_branch_id;
  if zone is null then return target_joined_at; end if;
  joined_local:=target_joined_at at time zone zone;
  session_day:=joined_local::date;
  select * into hours from public.operating_hours
    where branch_id=target_branch_id and day_of_week=extract(dow from session_day-1)::integer
      and is_open and close_time<open_time and joined_local::time<close_time limit 1;
  if found then return (session_day+hours.close_time) at time zone zone; end if;
  select * into hours from public.operating_hours
    where branch_id=target_branch_id and day_of_week=extract(dow from session_day)::integer limit 1;
  if hours.is_open and hours.close_time<>hours.open_time then
    if hours.close_time<hours.open_time then session_day:=session_day+1; end if;
    return (session_day+hours.close_time) at time zone zone;
  end if;
  return ((session_day+1)::timestamp) at time zone zone;
end $$;
revoke all on function public.ticket_queue_deadline(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.ticket_queue_deadline(uuid,timestamptz) to service_role;

alter table public.print_jobs drop constraint if exists print_jobs_status_check;
alter table public.print_jobs add constraint print_jobs_status_check
  check(status in ('pending','printing','printed','failed','cancelled','uncertain'));

create or replace function public.cancel_ineligible_print_jobs()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status::text not in ('waiting','called','serving') then
    update public.print_jobs set status='cancelled',
      error_message='Ticket is no longer active',updated_at=now()
    where ticket_id=new.id and status in ('pending','failed','printing','uncertain');
  end if;
  return new;
end $$;
revoke all on function public.cancel_ineligible_print_jobs() from public,anon,authenticated;
drop trigger if exists cancel_ineligible_print_jobs on public.tickets;
create trigger cancel_ineligible_print_jobs after update of status on public.tickets
for each row execute function public.cancel_ineligible_print_jobs();

create or replace function public.claim_next_print_job(target_device_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_device_id uuid; v_job public.print_jobs%rowtype; v_ticket_id uuid;
begin
  select id into v_device_id from public.devices
  where device_token=target_device_token and device_type='ticket_terminal' and is_active=true;
  if v_device_id is null then raise exception 'Terminal not found or disabled'; end if;
  update public.devices set last_seen_at=now(),updated_at=now() where id=v_device_id;

  update public.print_jobs j set status='cancelled',error_message='Ticket is no longer active or its queue day has ended',updated_at=now()
  from public.tickets t, public.branches b
  where j.device_id=v_device_id and j.ticket_id=t.id and b.id=t.branch_id
    and j.status in ('pending','failed','printing','uncertain')
    and (t.status::text not in ('waiting','called','serving')
      or public.ticket_queue_deadline(t.branch_id,t.joined_at)<=now());

  -- A crash may happen AFTER paper came out. Never blindly print this job again.
  update public.print_jobs set status='uncertain',
    error_message='Print confirmation missing. Check paper before reprinting.',updated_at=now()
  where device_id=v_device_id and status='printing' and claimed_at < now()-interval '2 minutes';

  -- Lock tickets before jobs, matching cancellation's lock order.
  select t.id into v_ticket_id from public.tickets t
  where t.status::text in ('waiting','called','serving') and exists (
    select 1 from public.print_jobs j where j.ticket_id=t.id and j.device_id=v_device_id
      and j.status in ('pending','failed') and j.attempt_count<5 and j.next_attempt_at<=now())
  order by t.joined_at,t.id for update of t skip locked limit 1;
  if v_ticket_id is null then return null; end if;
  select * into v_job from public.print_jobs
  where ticket_id=v_ticket_id and device_id=v_device_id and status in ('pending','failed')
    and attempt_count<5 and next_attempt_at<=now() for update skip locked;
  if v_job.id is null then return null; end if;
  update public.print_jobs set status='printing',attempt_count=attempt_count+1,
    claimed_at=now(),error_message=null,updated_at=now() where id=v_job.id;
  return jsonb_build_object('jobId',v_job.id,'ticketId',v_job.ticket_id,
    'payload',v_job.payload,'attempt',v_job.attempt_count+1);
end $$;
revoke all on function public.claim_next_print_job(uuid) from public;
grant execute on function public.claim_next_print_job(uuid) to anon,authenticated,service_role;

create or replace function public.complete_print_job(target_device_token uuid,target_job_id uuid,target_success boolean,target_error text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_device_id uuid; v_ticket_id uuid; v_status text; v_attempt integer;
begin
  select id into v_device_id from public.devices
  where device_token=target_device_token and device_type='ticket_terminal' and is_active=true;
  if v_device_id is null then raise exception 'Terminal not found or disabled'; end if;
  select ticket_id into v_ticket_id from public.print_jobs where id=target_job_id and device_id=v_device_id;
  if v_ticket_id is null then return false; end if;
  select status::text into v_status from public.tickets where id=v_ticket_id for update;
  select attempt_count into v_attempt from public.print_jobs
    where id=target_job_id and device_id=v_device_id and status in ('printing','uncertain') for update;
  if v_attempt is null then return false; end if;
  if v_status not in ('waiting','called','serving') or exists (select 1 from public.tickets
      where id=v_ticket_id and public.ticket_queue_deadline(branch_id,joined_at)<=now()) then
    update public.print_jobs set status='cancelled',updated_at=now() where id=target_job_id;
    return false;
  end if;
  if target_success then
    update public.print_jobs set status='printed',printed_at=now(),error_message=null,updated_at=now() where id=target_job_id;
    update public.tickets set printed_at=coalesce(printed_at,now()),updated_at=now() where id=v_ticket_id;
  else
    update public.print_jobs set status='failed',error_message=left(coalesce(target_error,'Printer error'),500),
      next_attempt_at=now()+make_interval(secs=>least(30,greatest(2,v_attempt*2))),updated_at=now()
    where id=target_job_id;
  end if;
  return true;
end $$;
revoke all on function public.complete_print_job(uuid,uuid,boolean,text) from public;
grant execute on function public.complete_print_job(uuid,uuid,boolean,text) to anon,authenticated,service_role;

create or replace function public.requeue_print_job(target_job_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_ticket_id uuid; v_branch_id uuid; v_status text;
begin
  select ticket_id,branch_id into v_ticket_id,v_branch_id from public.print_jobs where id=target_job_id;
  if v_ticket_id is null or not public.can_operate_branch(v_branch_id) then raise exception 'Not authorized to reprint this ticket'; end if;
  select status::text into v_status from public.tickets where id=v_ticket_id for update;
  if v_status not in ('waiting','called','serving') then raise exception 'Only active tickets can be reprinted'; end if;
  if exists(select 1 from public.tickets where id=v_ticket_id and public.ticket_queue_deadline(branch_id,joined_at)<=now()) then
    raise exception 'The ticket queue session has ended';
  end if;
  update public.print_jobs set status='pending',attempt_count=0,claimed_at=null,next_attempt_at=now(),
    error_message=null,updated_at=now() where id=target_job_id and status in ('failed','uncertain','printed');
  if not found then return false; end if;
  insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,details)
  select business_id,auth.uid(),'print.requeued','print_job',id,jsonb_build_object('ticket_id',ticket_id)
  from public.print_jobs where id=target_job_id;
  return true;
end $$;
revoke all on function public.requeue_print_job(uuid) from public,anon;
grant execute on function public.requeue_print_job(uuid) to authenticated;

-- Idempotent kiosk requests. Retries return the ORIGINAL result, never a second stub.
create table if not exists public.stub_requests (
  device_token uuid not null, request_id uuid not null, service_id uuid not null,
  result jsonb not null, created_at timestamptz not null default now(),
  primary key(device_token,request_id)
);
create index if not exists stub_requests_created_at on public.stub_requests(created_at);
alter table public.stub_requests enable row level security;
revoke all on public.stub_requests from public,anon,authenticated;
grant all on public.stub_requests to service_role;

do $$
begin
  if to_regprocedure('public.issue_stub_ticket_for_service_internal(uuid,uuid)') is null then
    alter function public.issue_stub_ticket_for_service(uuid,uuid) rename to issue_stub_ticket_for_service_internal;
  end if;
end $$;
revoke all on function public.issue_stub_ticket_for_service_internal(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.issue_stub_ticket_request(target_device_token uuid,target_service_id uuid,target_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_previous public.stub_requests%rowtype; v_result jsonb; v_limit jsonb;
begin
  if target_request_id is null then raise exception 'Request id is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_device_token::text||':'||target_request_id::text,0));
  if not exists(select 1 from public.devices where device_token=target_device_token and device_type='ticket_terminal' and is_active=true) then
    raise exception 'Terminal not found or disabled';
  end if;
  select * into v_previous from public.stub_requests
    where device_token=target_device_token and request_id=target_request_id;
  if found then
    if v_previous.service_id<>target_service_id then raise exception 'Request id belongs to a different service'; end if;
    return v_previous.result;
  end if;
  v_limit:=public.consume_app_rate_limit(md5('stub:'||target_device_token::text),120,60);
  if not coalesce((v_limit->>'allowed')::boolean,false) then raise exception 'Too many queue requests. Please wait and retry.'; end if;
  v_result:=public.issue_stub_ticket_for_service_internal(target_device_token,target_service_id);
  insert into public.stub_requests(device_token,request_id,service_id,result)
    values(target_device_token,target_request_id,target_service_id,v_result);
  return v_result;
end $$;
revoke all on function public.issue_stub_ticket_request(uuid,uuid,uuid) from public;
grant execute on function public.issue_stub_ticket_request(uuid,uuid,uuid) to anon,authenticated,service_role;

create or replace function public.issue_stub_ticket_for_service(target_device_token uuid,target_service_id uuid)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select public.issue_stub_ticket_request(target_device_token,target_service_id,gen_random_uuid());
$$;
revoke all on function public.issue_stub_ticket_for_service(uuid,uuid) from public;
grant execute on function public.issue_stub_ticket_for_service(uuid,uuid) to anon,authenticated,service_role;

-- Expired clients must still be able to finalize abandoned tickets.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.enforce_ticket_subscription_access()'::regprocedure);
  definition:=replace(definition,'''completed'',''cancelled'',''no_show''','''completed'',''cancelled'',''no_show'',''not_completed''');
  execute definition;
end $$;

create or replace function public.finalize_closed_branch_tickets()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer;
begin
  with changed as (
    update public.tickets t set status='not_completed',updated_at=now()
    from public.branches b where b.id=t.branch_id and t.status::text in ('waiting','called','serving')
    and public.ticket_queue_deadline(t.branch_id,t.joined_at)<=now() returning t.id
  ) select count(*) into v_count from changed;
  return v_count;
end $$;
revoke all on function public.finalize_closed_branch_tickets() from public,anon,authenticated;
grant execute on function public.finalize_closed_branch_tickets() to service_role;

create table if not exists public.worker_runs (
  name text primary key,last_started_at timestamptz,last_succeeded_at timestamptz,last_error text
);
alter table public.worker_runs enable row level security;
revoke all on public.worker_runs from public,anon,authenticated;
grant all on public.worker_runs to service_role;
notify pgrst,'reload schema';
