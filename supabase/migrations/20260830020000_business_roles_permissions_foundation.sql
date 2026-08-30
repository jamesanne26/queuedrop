-- QueueDrop business roles + permission catalog foundation.
-- Apply only after backing up the target database.
-- Existing business_users.role + permission booleans are preserved for compatibility;
-- role_id becomes the reusable business role assignment and role_permissions is the
-- source used when assigning/updating a role.

alter table public.business_users
  add column if not exists role_id uuid,
  add column if not exists can_view_live_queue boolean not null default true,
  add column if not exists can_return_customer boolean not null default false,
  add column if not exists can_move_pending boolean not null default false,
  add column if not exists can_reopen_completed_ticket boolean not null default false,
  add column if not exists can_view_history boolean not null default false,
  add column if not exists can_manage_branches boolean not null default false,
  add column if not exists can_manage_roles boolean not null default false,
  add column if not exists can_manage_settings boolean not null default false,
  add column if not exists can_manage_subscription boolean not null default false;

create table if not exists public.permissions (
  code text primary key,
  label text not null,
  description text,
  category text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  base_role public.user_role not null,
  branch_scope text not null default 'selected_branches',
  is_system boolean not null default false,
  is_protected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_name_length check (char_length(btrim(name)) between 2 and 60),
  constraint roles_branch_scope_check check (branch_scope in ('own_branch_only', 'selected_branches', 'all_branches')),
  constraint roles_base_role_check check (base_role in ('owner', 'admin', 'manager', 'staff'))
);

create unique index if not exists roles_business_name_lower_key
  on public.roles (business_id, lower(name));

create index if not exists roles_business_id_idx on public.roles (business_id, created_at);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_code)
);

alter table public.business_users
  drop constraint if exists business_users_role_id_fkey;
alter table public.business_users
  add constraint business_users_role_id_fkey
  foreign key (role_id) references public.roles(id) on delete set null;

insert into public.permissions(code, label, description, category, sort_order) values
  ('view_live_queue', 'View live queue', 'Open and view live branch queues.', 'Queue Management', 10),
  ('add_customer', 'Add customer', 'Register a customer into a queue.', 'Queue Management', 20),
  ('edit_customer', 'Edit customer', 'Edit customer queue details.', 'Queue Management', 30),
  ('cancel_customer', 'Delete / cancel customer', 'Cancel a customer ticket.', 'Queue Management', 40),
  ('call_next_customer', 'Call next customer', 'Call the next waiting customer.', 'Queue Management', 50),
  ('return_last_customer', 'Return last customer', 'Return the last called customer to the waiting queue.', 'Queue Management', 60),
  ('move_to_serving', 'Move to Serving', 'Move a customer into Serving.', 'Queue Management', 70),
  ('move_to_pending', 'Move to Pending', 'Move a serving customer to Pending and back.', 'Queue Management', 80),
  ('complete_customer', 'Complete customer', 'Complete a customer ticket.', 'Queue Management', 90),
  ('mark_no_show', 'Mark No Show', 'Mark a ticket as no-show.', 'Queue Management', 100),
  ('reopen_completed_ticket', 'Reopen completed ticket', 'Reopen a completed ticket when allowed.', 'Queue Management', 110),
  ('view_customer_contact', 'View customer contact', 'View customer mobile/contact details.', 'Queue Management', 120),
  ('view_history', 'View history', 'View completed/cancelled/no-show queue history.', 'Reports & History', 210),
  ('view_reports', 'View reports', 'Open business reports.', 'Reports & History', 220),
  ('export_reports', 'Export reports', 'Export report files.', 'Reports & History', 230),
  ('manage_services', 'Manage services', 'Create, edit, activate, or deactivate services.', 'Management', 310),
  ('manage_employees', 'Manage employees', 'Create and edit employee accounts.', 'Management', 320),
  ('manage_branches', 'Manage branches', 'Manage branch details and status.', 'Management', 330),
  ('manage_settings', 'Manage settings', 'Change operational/customer/notification settings.', 'Management', 340),
  ('manage_roles', 'Manage roles', 'Create roles and edit role permissions.', 'Management', 350),
  ('manage_subscription', 'Manage subscription / billing', 'View and manage billing-sensitive subscription actions.', 'Management', 360),
  ('view_audit_logs', 'View audit logs', 'View security and administrative audit logs.', 'Security', 410),
  ('manage_kiosk_display', 'Manage kiosk & display', 'Configure kiosk and display board options.', 'Management', 370),
  ('manage_operating_hours', 'Manage operating hours', 'Change branch operating hours.', 'Management', 380),
  ('manage_position_notifications', 'Manage position notifications', 'Change position-based notification rules.', 'Management', 390),
  ('manage_queue_information', 'Manage queue information settings', 'Change queue/customer information visibility and editing rules.', 'Management', 400)
on conflict (code) do update set
  label = excluded.label,
  description = excluded.description,
  category = excluded.category,
  sort_order = excluded.sort_order;

-- Default roles per existing business. These are reusable role records, not hardcoded UI labels.
insert into public.roles(business_id, name, description, base_role, branch_scope, is_system, is_protected)
select b.id, x.name, x.description, x.base_role::public.user_role, x.branch_scope, true, x.is_protected
from public.businesses b
cross join (values
  ('Owner', 'Business owner with full access.', 'owner', 'all_branches', true),
  ('Administrator', 'Business administrator with broad operational access.', 'admin', 'all_branches', true),
  ('Manager', 'Branch management and reporting role.', 'manager', 'selected_branches', false),
  ('Staff', 'Basic branch queue operations role.', 'staff', 'own_branch_only', false)
) as x(name, description, base_role, branch_scope, is_protected)
on conflict do nothing;

-- Seed default permission sets. Owner and Administrator receive every permission.
insert into public.role_permissions(role_id, permission_code)
select r.id, p.code
from public.roles r
join public.permissions p on true
where r.is_system = true and r.base_role in ('owner', 'admin')
on conflict do nothing;

-- Manager default permissions.
insert into public.role_permissions(role_id, permission_code)
select r.id, p.code
from public.roles r
join public.permissions p on p.code = any(array[
  'view_live_queue','add_customer','edit_customer','cancel_customer','call_next_customer',
  'return_last_customer','move_to_serving','move_to_pending','complete_customer','mark_no_show',
  'view_customer_contact','view_history','view_reports','export_reports','manage_services',
  'manage_employees','manage_branches','manage_settings','manage_kiosk_display',
  'manage_operating_hours','manage_position_notifications','manage_queue_information'
])
where r.is_system = true and r.base_role = 'manager'
on conflict do nothing;

-- Staff default permissions.
insert into public.role_permissions(role_id, permission_code)
select r.id, p.code
from public.roles r
join public.permissions p on p.code = any(array[
  'view_live_queue','add_customer','edit_customer','call_next_customer','return_last_customer',
  'move_to_serving','move_to_pending','complete_customer','mark_no_show'
])
where r.is_system = true and r.base_role = 'staff'
on conflict do nothing;

-- Promote any role labels already created by the previous QueueDrop version into
-- reusable custom roles instead of discarding them during the migration.
insert into public.roles(business_id, name, description, base_role, branch_scope, is_system, is_protected)
select distinct bu.business_id,
       btrim(bu.custom_role_name),
       'Migrated from existing employee role configuration.',
       bu.role,
       case when bu.role = 'staff' then 'own_branch_only' else 'selected_branches' end,
       false,
       false
from public.business_users bu
where bu.role in ('manager','staff')
  and nullif(btrim(bu.custom_role_name), '') is not null
  and lower(btrim(bu.custom_role_name)) not in ('manager','staff')
on conflict do nothing;

-- Preserve existing per-employee access as the starting permission set for migrated
-- custom roles. When several employees shared the same label, bool_and is used so
-- the migration never grants a capability that every existing holder did not have.
with migrated as (
  select r.id as role_id, bu.business_id, lower(btrim(bu.custom_role_name)) as role_name,
         bool_and(coalesce(bu.can_add_customer,false)) as add_customer,
         bool_and(coalesce(bu.can_edit_customer,false)) as edit_customer,
         bool_and(coalesce(bu.can_call_customer,false)) as call_next_customer,
         bool_and(coalesce(bu.can_serve_customer,false)) as move_to_serving,
         bool_and(coalesce(bu.can_complete_ticket,false)) as complete_customer,
         bool_and(coalesce(bu.can_cancel_ticket,false)) as cancel_customer,
         bool_and(coalesce(bu.can_mark_no_show,false)) as mark_no_show,
         bool_and(coalesce(bu.can_view_customer_contact,false)) as view_customer_contact,
         bool_and(coalesce(bu.can_view_reports,false)) as view_reports,
         bool_and(coalesce(bu.can_export_reports,false)) as export_reports,
         bool_and(coalesce(bu.can_manage_services,false)) as manage_services,
         bool_and(coalesce(bu.can_manage_team,false)) as manage_employees,
         bool_and(coalesce(bu.can_set_branch_status,false) or coalesce(bu.can_manage_operating_hours,false)) as manage_branches,
         bool_and(coalesce(bu.can_view_queue_information_editing,false) or coalesce(bu.can_view_position_notifications,false)) as manage_settings,
         bool_and(coalesce(bu.can_view_audit_logs,false)) as view_audit_logs,
         bool_and(coalesce(bu.can_manage_kiosk_display,false)) as manage_kiosk_display,
         bool_and(coalesce(bu.can_manage_operating_hours,false)) as manage_operating_hours,
         bool_and(coalesce(bu.can_view_position_notifications,false)) as manage_position_notifications,
         bool_and(coalesce(bu.can_view_queue_information_editing,false)) as manage_queue_information
  from public.business_users bu
  join public.roles r on r.business_id = bu.business_id
    and lower(r.name) = lower(btrim(bu.custom_role_name))
    and r.is_system = false
  where bu.role in ('manager','staff') and nullif(btrim(bu.custom_role_name), '') is not null
  group by r.id, bu.business_id, lower(btrim(bu.custom_role_name))
), expanded as (
  select role_id, permission_code
  from migrated m
  cross join lateral (values
    ('view_live_queue', true),
    ('add_customer', m.add_customer), ('edit_customer', m.edit_customer),
    ('call_next_customer', m.call_next_customer), ('move_to_serving', m.move_to_serving),
    ('move_to_pending', m.move_to_serving), ('return_last_customer', m.call_next_customer),
    ('complete_customer', m.complete_customer), ('cancel_customer', m.cancel_customer),
    ('mark_no_show', m.mark_no_show), ('view_customer_contact', m.view_customer_contact),
    ('view_history', m.view_reports), ('view_reports', m.view_reports), ('export_reports', m.export_reports),
    ('manage_services', m.manage_services), ('manage_employees', m.manage_employees),
    ('manage_branches', m.manage_branches), ('manage_settings', m.manage_settings),
    ('view_audit_logs', m.view_audit_logs), ('manage_kiosk_display', m.manage_kiosk_display),
    ('manage_operating_hours', m.manage_operating_hours),
    ('manage_position_notifications', m.manage_position_notifications),
    ('manage_queue_information', m.manage_queue_information)
  ) v(permission_code, enabled)
  where enabled
)
insert into public.role_permissions(role_id, permission_code)
select role_id, permission_code from expanded
on conflict do nothing;

-- Assign migrated custom roles before falling back to the standard Manager/Staff role.
update public.business_users bu
set role_id = r.id
from public.roles r
where bu.role_id is null
  and r.business_id = bu.business_id
  and r.is_system = false
  and lower(r.name) = lower(btrim(bu.custom_role_name))
  and r.base_role = bu.role;

-- Map existing memberships to the matching protected/default role first.
update public.business_users bu
set role_id = r.id
from public.roles r
where bu.role_id is null
  and r.business_id = bu.business_id
  and r.is_system = true
  and r.base_role = bu.role
  and ((bu.role = 'admin' and r.name = 'Administrator') or (bu.role <> 'admin' and lower(r.name) = bu.role::text));

-- Keep custom_role_name as a compatibility display field while the app transitions.
update public.business_users bu
set custom_role_name = coalesce(nullif(btrim(bu.custom_role_name), ''), r.name)
from public.roles r
where bu.role_id = r.id;

create or replace function public.apply_business_role_to_user(target_business_user_id uuid, target_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_business_id uuid;
  actor_role public.user_role;
  actor_can_manage_roles boolean;
  target_business_id uuid;
  selected_role public.roles%rowtype;
  has_permission boolean;
begin
  select bu.business_id, bu.role, coalesce(bu.can_manage_roles, false)
    into actor_business_id, actor_role, actor_can_manage_roles
  from public.business_users bu
  where bu.user_id = auth.uid() and bu.is_active = true
  limit 1;

  if actor_business_id is null or not (actor_role in ('owner','admin') or actor_can_manage_roles) then
    raise exception 'You do not have permission to assign roles.';
  end if;

  select bu.business_id into target_business_id
  from public.business_users bu
  where bu.id = target_business_user_id;

  if target_business_id is null or target_business_id <> actor_business_id then
    raise exception 'Employee was not found in this business.';
  end if;

  select * into selected_role
  from public.roles r
  where r.id = target_role_id and r.business_id = actor_business_id;

  if selected_role.id is null then raise exception 'Role was not found.'; end if;

  update public.business_users
  set role_id = selected_role.id,
      role = selected_role.base_role,
      custom_role_name = selected_role.name
  where id = target_business_user_id;

  -- Synchronize the legacy booleans so all existing QueueDrop authorization code
  -- immediately follows the selected reusable role.
  update public.business_users bu set
    can_view_live_queue = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'view_live_queue'),
    can_add_customer = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'add_customer'),
    can_edit_customer = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'edit_customer'),
    can_cancel_ticket = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'cancel_customer'),
    can_call_customer = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'call_next_customer'),
    can_return_customer = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'return_last_customer'),
    can_serve_customer = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'move_to_serving'),
    can_move_pending = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'move_to_pending'),
    can_complete_ticket = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'complete_customer'),
    can_mark_no_show = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'mark_no_show'),
    can_reopen_completed_ticket = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'reopen_completed_ticket'),
    can_view_customer_contact = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'view_customer_contact'),
    can_view_history = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'view_history'),
    can_view_reports = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'view_reports'),
    can_export_reports = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'export_reports'),
    can_manage_services = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_services'),
    can_manage_team = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_employees'),
    can_manage_branches = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_branches'),
    can_set_branch_status = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_branches'),
    can_manage_settings = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_settings'),
    can_manage_roles = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_roles'),
    can_manage_subscription = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_subscription'),
    can_view_audit_logs = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'view_audit_logs'),
    can_manage_kiosk_display = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_kiosk_display'),
    can_manage_operating_hours = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_operating_hours'),
    can_view_position_notifications = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_position_notifications'),
    can_view_queue_information_editing = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_queue_information')
  where bu.id = target_business_user_id;
end;
$$;

-- Re-apply default role permissions to all mapped memberships.
do $$
declare row record;
begin
  for row in select id, role_id from public.business_users where role_id is not null loop
    -- Direct sync without auth-context checks for migration backfill.
    update public.business_users bu set
      can_view_live_queue = exists(select 1 from public.role_permissions rp where rp.role_id = row.role_id and rp.permission_code = 'view_live_queue'),
      can_return_customer = exists(select 1 from public.role_permissions rp where rp.role_id = row.role_id and rp.permission_code = 'return_last_customer'),
      can_move_pending = exists(select 1 from public.role_permissions rp where rp.role_id = row.role_id and rp.permission_code = 'move_to_pending'),
      can_reopen_completed_ticket = exists(select 1 from public.role_permissions rp where rp.role_id = row.role_id and rp.permission_code = 'reopen_completed_ticket'),
      can_view_history = exists(select 1 from public.role_permissions rp where rp.role_id = row.role_id and rp.permission_code = 'view_history'),
      can_manage_branches = exists(select 1 from public.role_permissions rp where rp.role_id = row.role_id and rp.permission_code = 'manage_branches'),
      can_manage_roles = exists(select 1 from public.role_permissions rp where rp.role_id = row.role_id and rp.permission_code = 'manage_roles'),
      can_manage_settings = exists(select 1 from public.role_permissions rp where rp.role_id = row.role_id and rp.permission_code = 'manage_settings'),
      can_manage_subscription = exists(select 1 from public.role_permissions rp where rp.role_id = row.role_id and rp.permission_code = 'manage_subscription')
    where bu.id = row.id;
  end loop;
end $$;

alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;

drop policy if exists permissions_read_authenticated on public.permissions;
create policy permissions_read_authenticated on public.permissions
for select to authenticated using (true);

drop policy if exists roles_business_read on public.roles;
create policy roles_business_read on public.roles
for select to authenticated using (public.is_business_member(business_id));

drop policy if exists role_permissions_business_read on public.role_permissions;
create policy role_permissions_business_read on public.role_permissions
for select to authenticated using (
  exists (
    select 1 from public.roles r
    where r.id = role_permissions.role_id and public.is_business_member(r.business_id)
  )
);

grant select on public.permissions, public.roles, public.role_permissions to authenticated;
revoke all on function public.apply_business_role_to_user(uuid, uuid) from public;
grant execute on function public.apply_business_role_to_user(uuid, uuid) to authenticated;

-- Internal compatibility synchronizer. Not granted to application roles directly.
create or replace function public.sync_business_user_role_permissions(target_business_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_role public.roles%rowtype;
begin
  select r.* into selected_role
  from public.business_users bu
  join public.roles r on r.id = bu.role_id
  where bu.id = target_business_user_id;

  if selected_role.id is null then return; end if;

  update public.business_users bu set
    role = selected_role.base_role,
    custom_role_name = selected_role.name,
    can_view_live_queue = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'view_live_queue'),
    can_add_customer = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'add_customer'),
    can_edit_customer = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'edit_customer'),
    can_cancel_ticket = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'cancel_customer'),
    can_call_customer = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'call_next_customer'),
    can_return_customer = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'return_last_customer'),
    can_serve_customer = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'move_to_serving'),
    can_move_pending = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'move_to_pending'),
    can_complete_ticket = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'complete_customer'),
    can_mark_no_show = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'mark_no_show'),
    can_reopen_completed_ticket = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'reopen_completed_ticket'),
    can_view_customer_contact = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'view_customer_contact'),
    can_view_history = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'view_history'),
    can_view_reports = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'view_reports'),
    can_export_reports = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'export_reports'),
    can_manage_services = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_services'),
    can_manage_team = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_employees'),
    can_manage_branches = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_branches'),
    can_set_branch_status = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_branches'),
    can_manage_settings = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_settings'),
    can_manage_roles = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_roles'),
    can_manage_subscription = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_subscription'),
    can_view_audit_logs = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'view_audit_logs'),
    can_manage_kiosk_display = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_kiosk_display'),
    can_manage_operating_hours = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_operating_hours'),
    can_view_position_notifications = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_position_notifications'),
    can_view_queue_information_editing = exists(select 1 from public.role_permissions rp where rp.role_id = selected_role.id and rp.permission_code = 'manage_queue_information')
  where bu.id = target_business_user_id;
end;
$$;

revoke all on function public.sync_business_user_role_permissions(uuid) from public, anon, authenticated;

create or replace function public.apply_business_role_to_user(target_business_user_id uuid, target_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_business_id uuid;
  actor_role public.user_role;
  actor_can_manage_team boolean;
  actor_can_manage_roles boolean;
  target_business_id uuid;
  selected_role public.roles%rowtype;
begin
  select bu.business_id, bu.role, coalesce(bu.can_manage_team, false), coalesce(bu.can_manage_roles, false)
    into actor_business_id, actor_role, actor_can_manage_team, actor_can_manage_roles
  from public.business_users bu
  where bu.user_id = auth.uid() and bu.is_active = true
  limit 1;

  if actor_business_id is null or not (actor_role in ('owner','admin') or actor_can_manage_team or actor_can_manage_roles) then
    raise exception 'You do not have permission to assign roles.';
  end if;

  select bu.business_id into target_business_id
  from public.business_users bu
  where bu.id = target_business_user_id;

  if target_business_id is null or target_business_id <> actor_business_id then
    raise exception 'Employee was not found in this business.';
  end if;

  select * into selected_role
  from public.roles r
  where r.id = target_role_id and r.business_id = actor_business_id;

  if selected_role.id is null then raise exception 'Role was not found.'; end if;
  if selected_role.base_role in ('owner','admin') then
    raise exception 'Owner and Administrator roles are protected and cannot be assigned from employee management.';
  end if;

  update public.business_users
  set role_id = selected_role.id
  where id = target_business_user_id;

  perform public.sync_business_user_role_permissions(target_business_user_id);
end;
$$;

revoke all on function public.apply_business_role_to_user(uuid, uuid) from public, anon, service_role;
grant execute on function public.apply_business_role_to_user(uuid, uuid) to authenticated;

create or replace function public.manage_team_member_with_business_role(
  target_user_id uuid,
  target_role_id uuid,
  target_branch_ids uuid[] default '{}'::uuid[],
  target_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_business_id uuid;
  actor_role public.user_role;
  actor_can_manage_team boolean;
  target_role public.roles%rowtype;
  membership_id uuid;
  effective_branch_ids uuid[];
  existing_role public.user_role;
begin
  select bu.business_id, bu.role, coalesce(bu.can_manage_team, false)
    into actor_business_id, actor_role, actor_can_manage_team
  from public.business_users bu
  where bu.user_id = auth.uid() and bu.is_active = true
  limit 1;

  if actor_business_id is null or not (actor_role in ('owner','admin') or actor_can_manage_team) then
    raise exception 'You do not have permission to manage employees.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot change your own team access from this screen.';
  end if;

  select * into target_role
  from public.roles r
  where r.id = target_role_id and r.business_id = actor_business_id;

  if target_role.id is null then raise exception 'Role was not found.'; end if;
  if target_role.base_role in ('owner','admin') then
    raise exception 'Owner and Administrator roles cannot be assigned from employee management.';
  end if;

  select bu.role into existing_role
  from public.business_users bu
  where bu.business_id = actor_business_id and bu.user_id = target_user_id;
  if existing_role in ('owner','admin') then raise exception 'Owner and admin accounts are protected.'; end if;

  if target_role.branch_scope = 'all_branches' then
    select coalesce(array_agg(b.id order by b.created_at), '{}'::uuid[]) into effective_branch_ids
    from public.branches b where b.business_id = actor_business_id;
  elsif target_role.branch_scope = 'own_branch_only' then
    if coalesce(cardinality(target_branch_ids), 0) <> 1 then
      raise exception 'This role requires exactly one assigned branch.';
    end if;
    effective_branch_ids := target_branch_ids;
  else
    if coalesce(cardinality(target_branch_ids), 0) = 0 then
      raise exception 'This role requires at least one selected branch.';
    end if;
    effective_branch_ids := target_branch_ids;
  end if;

  if exists (
    select 1 from unnest(coalesce(effective_branch_ids, '{}'::uuid[])) requested(branch_id)
    where not exists (
      select 1 from public.branches b
      where b.id = requested.branch_id and b.business_id = actor_business_id
    )
  ) then
    raise exception 'One or more selected branches do not belong to this business.';
  end if;

  -- A delegated manager may only assign employees inside branches they themselves can access.
  if actor_role not in ('owner','admin') and exists (
    select 1 from unnest(coalesce(effective_branch_ids, '{}'::uuid[])) requested(branch_id)
    where not exists (
      select 1 from public.branch_users actor_branch
      where actor_branch.user_id = auth.uid() and actor_branch.branch_id = requested.branch_id
    )
  ) then
    raise exception 'You can assign employees only to your own branches.';
  end if;

  insert into public.business_users(business_id, user_id, role, role_id, custom_role_name, is_active)
  values(actor_business_id, target_user_id, target_role.base_role, target_role.id, target_role.name, target_active)
  on conflict (business_id, user_id) do update set
    role = excluded.role,
    role_id = excluded.role_id,
    custom_role_name = excluded.custom_role_name,
    is_active = excluded.is_active
  returning id into membership_id;

  delete from public.branch_users bru
  using public.branches b
  where bru.branch_id = b.id and bru.user_id = target_user_id and b.business_id = actor_business_id;

  insert into public.branch_users(branch_id, user_id)
  select distinct requested.branch_id, target_user_id
  from unnest(coalesce(effective_branch_ids, '{}'::uuid[])) requested(branch_id)
  on conflict (branch_id, user_id) do nothing;

  perform public.sync_business_user_role_permissions(membership_id);

  return membership_id;
end;
$$;

revoke all on function public.manage_team_member_with_business_role(uuid, uuid, uuid[], boolean) from public, anon, service_role;
grant execute on function public.manage_team_member_with_business_role(uuid, uuid, uuid[], boolean) to authenticated;
