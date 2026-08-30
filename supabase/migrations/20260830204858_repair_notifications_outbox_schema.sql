alter table public.notifications
  add column if not exists branch_id uuid references public.branches(id) on delete cascade,
  add column if not exists position_rule_id uuid references public.position_notification_rules(id) on delete set null,
  add column if not exists queue_position integer,
  add column if not exists payload jsonb not null default '{}'::jsonb;

create index if not exists notifications_branch_id_idx
  on public.notifications(branch_id);

create index if not exists notifications_ticket_id_idx
  on public.notifications(ticket_id);

create index if not exists notifications_status_idx
  on public.notifications(status);

create index if not exists notifications_created_at_idx
  on public.notifications(created_at desc);

create unique index if not exists notifications_ticket_position_sms_unique
  on public.notifications(ticket_id, queue_position, channel)
  where channel = 'sms'
    and notification_type = 'queue_position'
    and ticket_id is not null
    and queue_position is not null;