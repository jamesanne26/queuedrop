-- Reassert automatic queue-position enqueueing after the notifications
-- outbox schema repair. Only waiting tickets are considered by
-- enqueue_branch_position_notifications().

create or replace function public.queue_ticket_position_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.enqueue_branch_position_notifications(new.branch_id);
  elsif old.status is distinct from new.status then
    perform public.enqueue_branch_position_notifications(new.branch_id);
  end if;
  return new;
end;
$$;

drop trigger if exists queue_ticket_position_notifications on public.tickets;

create trigger queue_ticket_position_notifications
after insert or update of status on public.tickets
for each row
execute function public.queue_ticket_position_notification_trigger();
