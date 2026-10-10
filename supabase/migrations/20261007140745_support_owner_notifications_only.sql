-- Client support updates stay in the portal. Only new reports notify support.
drop trigger if exists support_resolution_notification on public.support_reports;
create or replace function support_private.queue_resolution() returns trigger
language plpgsql security definer set search_path='' as $$
begin return new; end $$;
revoke all on function support_private.queue_resolution() from public,anon,authenticated;
-- Preserve historical delivery audit; prevent outstanding legacy client retries.
update support_private.notifications set state='unavailable',claim=null,lease_until=null,
 last_error='Client support emails disabled by owner.'
 where state in ('pending','sending','failed') and event_key not like 'support-created:%';
create or replace function support_private.queue_support_report() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into support_private.notifications(report_id,event_key,recipient,body,state)
 values(new.id,'support-created:'||new.id::text,'jamesrae.rosario18@gmail.com',
 'New QueueDrop support report #'||new.number||': '||new.title,'pending')
 on conflict(event_key) do nothing;
 return new;
end $$;
revoke all on function support_private.queue_support_report() from public,anon,authenticated;
drop trigger if exists support_report_notification on public.support_reports;
create trigger support_report_notification after insert on public.support_reports
 for each row execute function support_private.queue_support_report();
notify pgrst,'reload schema';
