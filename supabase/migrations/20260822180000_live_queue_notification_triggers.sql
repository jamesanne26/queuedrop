set local check_function_bodies = off;

-- Milestone 8: live queue notification trigger engine.
-- The existing public.notifications table becomes the provider-agnostic outbox.
-- Actual SMS / browser push delivery will be connected later; this milestone
-- creates deduplicated pending jobs whenever a waiting ticket reaches a
-- configured position.

alter table public.notifications
  add column if not exists branch_id uuid,
  add column if not exists position_rule_id uuid,
  add column if not exists queue_position integer,
  add column if not exists payload jsonb not null default '{}'::jsonb;

alter table public.notifications
  drop constraint if exists notifications_branch_id_fkey;
alter table public.notifications
  add constraint notifications_branch_id_fkey
  foreign key (branch_id) references public.branches(id) on delete cascade;

alter table public.notifications
  drop constraint if exists notifications_position_rule_id_fkey;
alter table public.notifications
  add constraint notifications_position_rule_id_fkey
  foreign key (position_rule_id)
  references public.position_notification_rules(id) on delete set null;

alter table public.notifications
  drop constraint if exists notifications_queue_position_check;
alter table public.notifications
  add constraint notifications_queue_position_check
  check (queue_position is null or queue_position >= 1);

create index if not exists idx_notifications_branch_created
  on public.notifications(branch_id, created_at desc);

create unique index if not exists uq_notifications_queue_position_once
  on public.notifications(ticket_id, queue_position, channel)
  where notification_type = 'queue_position'
    and ticket_id is not null
    and queue_position is not null;

-- Backfill branch_id for any older ticket-based notifications.
update public.notifications n
set branch_id = t.branch_id
from public.tickets t
where n.ticket_id = t.id
  and n.branch_id is null;

-- Staff/managers may see notification jobs only for their assigned branches;
-- owner/admin remain business-wide. This replaces the older business-member
-- policy that was too broad for branch-scoped staff.
drop policy if exists "Business members can view notifications"
  on public.notifications;
drop policy if exists "Scoped members can view notifications"
  on public.notifications;

create policy "Scoped members can view notifications"
on public.notifications
for select
to authenticated
using (
  public.is_business_admin(business_id)
  or (
    branch_id is not null
    and public.is_branch_member(branch_id)
  )
);

create or replace function public.enqueue_branch_position_notifications(
  target_branch_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_branch_name text;
  v_inserted integer := 0;
  v_rows integer := 0;
  v_candidate record;
  v_rule public.position_notification_rules%rowtype;
  v_phone text;
  v_message text;
begin
  select b.business_id, b.name
    into v_business_id, v_branch_name
  from public.branches b
  where b.id = target_branch_id;

  if v_business_id is null then
    return 0;
  end if;

  -- Position is service-specific, matching get_public_ticket_status().
  for v_candidate in
    with waiting as (
      select
        t.id as ticket_id,
        t.customer_id,
        t.customer_session_id,
        t.service_id,
        t.display_number,
        coalesce(t.customer_phone_override, c.phone) as phone,
        s.name as service_name,
        row_number() over (
          partition by t.queue_session_id, t.service_id
          order by t.ticket_number, t.joined_at, t.id
        )::integer as queue_position
      from public.tickets t
      join public.queue_sessions qs on qs.id = t.queue_session_id
      join public.customers c on c.id = t.customer_id
      join public.services s on s.id = t.service_id
      where t.branch_id = target_branch_id
        and t.status = 'waiting'
        and qs.status = 'open'
    )
    select * from waiting
  loop
    for v_rule in
      select r.*
      from public.position_notification_rules r
      where r.branch_id = target_branch_id
        and r.position = v_candidate.queue_position
        and (r.send_sms_once or r.browser_notification)
    loop
      v_phone := nullif(btrim(v_candidate.phone), '');
      v_message := format(
        'QueueDrop: %s is now position %s for %s at %s.',
        v_candidate.display_number,
        v_candidate.queue_position,
        v_candidate.service_name,
        v_branch_name
      );

      if v_rule.send_sms_once and v_phone is not null then
        insert into public.notifications (
          business_id,
          branch_id,
          customer_id,
          ticket_id,
          channel,
          notification_type,
          recipient,
          message,
          status,
          position_rule_id,
          queue_position,
          payload
        ) values (
          v_business_id,
          target_branch_id,
          v_candidate.customer_id,
          v_candidate.ticket_id,
          'sms',
          'queue_position',
          v_phone,
          v_message,
          'pending',
          v_rule.id,
          v_candidate.queue_position,
          jsonb_build_object(
            'service_id', v_candidate.service_id,
            'service_name', v_candidate.service_name,
            'display_number', v_candidate.display_number,
            'position', v_candidate.queue_position
          )
        )
        on conflict do nothing;

        get diagnostics v_rows = row_count;
        v_inserted := v_inserted + v_rows;
      end if;

      if v_rule.browser_notification then
        insert into public.notifications (
          business_id,
          branch_id,
          customer_id,
          ticket_id,
          channel,
          notification_type,
          recipient,
          message,
          status,
          position_rule_id,
          queue_position,
          payload
        ) values (
          v_business_id,
          target_branch_id,
          v_candidate.customer_id,
          v_candidate.ticket_id,
          'web',
          'queue_position',
          null,
          v_message,
          'pending',
          v_rule.id,
          v_candidate.queue_position,
          jsonb_build_object(
            'customer_session_id', v_candidate.customer_session_id,
            'service_id', v_candidate.service_id,
            'service_name', v_candidate.service_name,
            'display_number', v_candidate.display_number,
            'position', v_candidate.queue_position
          )
        )
        on conflict do nothing;

        get diagnostics v_rows = row_count;
        v_inserted := v_inserted + v_rows;
      end if;
    end loop;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.enqueue_branch_position_notifications(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.enqueue_branch_position_notifications(uuid)
  to postgres, service_role;

create or replace function public.queue_ticket_position_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- For INSERT, evaluate the newcomer's current position. For status changes,
  -- evaluate everybody left waiting because their positions may have moved.
  if tg_op = 'INSERT' then
    perform public.enqueue_branch_position_notifications(new.branch_id);
  elsif old.status is distinct from new.status then
    perform public.enqueue_branch_position_notifications(new.branch_id);
  end if;
  return new;
end;
$$;

revoke all on function public.queue_ticket_position_notification_trigger()
  from public, anon, authenticated, service_role;

drop trigger if exists queue_ticket_position_notifications
  on public.tickets;

create trigger queue_ticket_position_notifications
after insert or update of status on public.tickets
for each row
execute function public.queue_ticket_position_notification_trigger();

-- Seeded DEV tickets are created before Milestone 7.1 position rules are
-- inserted. This audit-safe helper lets the UI/testing path initialize jobs on
-- the next real queue movement; no synthetic notifications are added here.
