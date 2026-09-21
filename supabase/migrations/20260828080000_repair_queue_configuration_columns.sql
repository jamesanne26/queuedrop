alter table public.queue_configurations
  add column if not exists show_branch_contact boolean not null default true,
  add column if not exists customer_can_edit_name boolean not null default false,
  add column if not exists customer_can_edit_mobile boolean not null default false,
  add column if not exists staff_can_edit_name boolean not null default true,
  add column if not exists staff_can_edit_mobile boolean not null default true,
  add column if not exists manager_can_edit_name boolean not null default true,
  add column if not exists manager_can_edit_mobile boolean not null default true;

notify pgrst, 'reload schema';
