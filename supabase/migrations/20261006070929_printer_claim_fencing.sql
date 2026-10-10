-- Fence printer claims across retries and explicit operator reprints.
alter table public.print_jobs add column if not exists reprint_generation integer not null default 0 check(reprint_generation>=0);
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
    'generation',v_job.reprint_generation,'payload',v_job.payload,'attempt',v_job.attempt_count+1);
end $$;
revoke all on function public.claim_next_print_job(uuid) from public;
grant execute on function public.claim_next_print_job(uuid) to anon,authenticated,service_role;

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
  update public.print_jobs set status='pending',reprint_generation=reprint_generation+1,attempt_count=0,claimed_at=null,next_attempt_at=now(),
    error_message=null,updated_at=now() where id=target_job_id and status in ('failed','uncertain','printed');
  if not found then return false; end if;
  insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,details)
  select business_id,auth.uid(),'print.requeued','print_job',id,jsonb_build_object('ticket_id',ticket_id)
  from public.print_jobs where id=target_job_id;
  return true;
end $$;
revoke all on function public.requeue_print_job(uuid) from public,anon;
grant execute on function public.requeue_print_job(uuid) to authenticated;


create or replace function public.print_job_retry_allowed(target_device_token uuid,target_job_id uuid,target_generation integer,target_attempt integer)
returns boolean language sql security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.print_jobs j join public.devices d on d.id=j.device_id join public.tickets t on t.id=j.ticket_id
 where j.id=target_job_id and d.device_token=target_device_token and d.device_type='ticket_terminal' and d.is_active
 and j.status='printing' and j.reprint_generation=target_generation and j.attempt_count=target_attempt
 and t.status::text in ('waiting','called','serving') and public.ticket_queue_deadline(t.branch_id,t.joined_at)>now());
$$;
revoke all on function public.print_job_retry_allowed(uuid,uuid,integer,integer) from public;
grant execute on function public.print_job_retry_allowed(uuid,uuid,integer,integer) to anon,authenticated,service_role;

create or replace function public.complete_print_job_attempt(target_device_token uuid,target_job_id uuid,target_generation integer,target_attempt integer,target_success boolean,target_error text default null,target_uncertain boolean default false)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare ticket_id uuid; v_job public.print_jobs%rowtype;
begin
 select j.ticket_id into ticket_id from public.print_jobs j join public.devices d on d.id=j.device_id
 where j.id=target_job_id and d.device_token=target_device_token and d.device_type='ticket_terminal' and d.is_active;
 if ticket_id is null then return false; end if;
 perform 1 from public.tickets t where t.id=ticket_id for update;
 select * into v_job from public.print_jobs where id=target_job_id for update;
 if v_job.reprint_generation<>target_generation or v_job.attempt_count<>target_attempt or v_job.status not in ('printing','uncertain') then return false; end if;
 if not exists(select 1 from public.tickets t where t.id=ticket_id and t.status::text in ('waiting','called','serving') and public.ticket_queue_deadline(t.branch_id,t.joined_at)>now()) then
   update public.print_jobs set status='cancelled',updated_at=now() where id=target_job_id;
   return false;
 end if;
 if target_uncertain then
   update public.print_jobs set status='uncertain',error_message=left(coalesce(target_error,'Printer transfer uncertain; inspect paper before reprint'),500),updated_at=now() where id=target_job_id;
   return true;
 end if;
 return public.complete_print_job(target_device_token,target_job_id,target_success,target_error);
end $$;
revoke all on function public.complete_print_job_attempt(uuid,uuid,integer,integer,boolean,text,boolean) from public;
grant execute on function public.complete_print_job_attempt(uuid,uuid,integer,integer,boolean,text,boolean) to anon,authenticated,service_role;
notify pgrst,'reload schema';
