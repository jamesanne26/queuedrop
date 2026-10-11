-- Reconcile missing Production performance indexes and notification invariant
-- on Test. All indexes are idempotent; duplicate/invalid queue positions were
-- checked before adding the partial unique index and CHECK constraint.
create index if not exists idx_branch_users_user_branch
  on public.branch_users using btree (user_id, branch_id);
create index if not exists idx_branches_business_created
  on public.branches using btree (business_id, created_at);
create index if not exists idx_business_users_business_created
  on public.business_users using btree (business_id, created_at);
create index if not exists idx_business_users_user_active
  on public.business_users using btree (user_id, is_active);
create index if not exists idx_notifications_branch_created
  on public.notifications using btree (branch_id, created_at desc);
create unique index if not exists uq_notifications_queue_position_once
  on public.notifications using btree (ticket_id, queue_position, channel)
  where notification_type = 'queue_position'
    and ticket_id is not null
    and queue_position is not null;
create index if not exists idx_operating_hours_branch_day
  on public.operating_hours using btree (branch_id, day_of_week);
create index if not exists idx_position_rules_branch_position
  on public.position_notification_rules using btree (branch_id, "position");
create index if not exists idx_queue_configurations_branch_edit_flags
  on public.queue_configurations using btree (branch_id);
create index if not exists idx_services_branch_active_created
  on public.services using btree (branch_id, is_active, created_at);
create index if not exists idx_tickets_branch_status_created_desc
  on public.tickets using btree (branch_id, status, created_at desc);
create index if not exists idx_tickets_branch_status_joined
  on public.tickets using btree (branch_id, status, joined_at);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_queue_position_check'
  ) then
    alter table public.notifications
      add constraint notifications_queue_position_check
      check (queue_position is null or queue_position >= 1) not valid;
  end if;
end $$;

alter table public.notifications
  validate constraint notifications_queue_position_check;
