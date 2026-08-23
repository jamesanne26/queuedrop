-- QueueDrop performance-only indexes. No business behavior changes.

create index if not exists idx_business_users_user_active
  on public.business_users (user_id, is_active);

create index if not exists idx_business_users_business_created
  on public.business_users (business_id, created_at);

create index if not exists idx_branch_users_user_branch
  on public.branch_users (user_id, branch_id);

create index if not exists idx_branches_business_created
  on public.branches (business_id, created_at);

create index if not exists idx_services_branch_active_created
  on public.services (branch_id, is_active, created_at);

create index if not exists idx_tickets_branch_status_joined
  on public.tickets (branch_id, status, joined_at);

create index if not exists idx_tickets_branch_status_created_desc
  on public.tickets (branch_id, status, created_at desc);

create index if not exists idx_queue_configurations_branch_edit_flags
  on public.queue_configurations (branch_id);

create index if not exists idx_operating_hours_branch_day
  on public.operating_hours (branch_id, day_of_week);

create index if not exists idx_position_rules_branch_position
  on public.position_notification_rules (branch_id, position);
