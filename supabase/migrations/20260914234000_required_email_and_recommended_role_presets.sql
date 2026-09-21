-- QueueDrop users/roles finalization.
-- 1) Every new business gets Admin, Manager, and Staff default roles.
-- 2) Default roles receive recommended permission presets.
-- 3) Existing businesses missing Manager get it without overwriting customized roles.
-- Email-required login is enforced in the application/Auth flow because legacy
-- phone-only staff may still exist and cannot be assigned a real email safely by SQL.

create or replace function public.seed_default_business_roles()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.roles(business_id,name,description,base_role,branch_scope,is_system,is_protected)
  values
    (new.id,'Admin','Business administrator with broad operational access.','admin','all_branches',true,true),
    (new.id,'Manager','Recommended branch management and reporting role.','manager','selected_branches',true,false),
    (new.id,'Staff','Recommended day-to-day queue operations role.','staff','own_branch_only',true,false)
  on conflict do nothing;

  insert into public.role_permissions(role_id, permission_code)
  select r.id, p.code
  from public.roles r
  join public.permissions p on true
  where r.business_id = new.id and r.base_role = 'admin' and r.is_system = true
  on conflict do nothing;

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
  where r.business_id = new.id and r.base_role = 'manager' and r.is_system = true
  on conflict do nothing;

  insert into public.role_permissions(role_id, permission_code)
  select r.id, p.code
  from public.roles r
  join public.permissions p on p.code = any(array[
    'view_live_queue','add_customer','edit_customer','call_next_customer','return_last_customer',
    'move_to_serving','move_to_pending','complete_customer','mark_no_show'
  ])
  where r.business_id = new.id and r.base_role = 'staff' and r.is_system = true
  on conflict do nothing;

  return new;
end;
$$;

-- Existing businesses: ensure the three client-facing defaults exist.
insert into public.roles(business_id,name,description,base_role,branch_scope,is_system,is_protected)
select b.id,'Admin','Business administrator with broad operational access.','admin','all_branches',true,true
from public.businesses b
where not exists (
  select 1 from public.roles r where r.business_id=b.id and lower(r.name)='admin'
)
on conflict do nothing;

insert into public.roles(business_id,name,description,base_role,branch_scope,is_system,is_protected)
select b.id,'Manager','Recommended branch management and reporting role.','manager','selected_branches',true,false
from public.businesses b
where not exists (
  select 1 from public.roles r where r.business_id=b.id and lower(r.name)='manager'
)
on conflict do nothing;

insert into public.roles(business_id,name,description,base_role,branch_scope,is_system,is_protected)
select b.id,'Staff','Recommended day-to-day queue operations role.','staff','own_branch_only',true,false
from public.businesses b
where not exists (
  select 1 from public.roles r where r.business_id=b.id and lower(r.name)='staff'
)
on conflict do nothing;

update public.roles
set is_system=true, is_protected=true
where base_role='admin' and lower(name)='admin';

update public.roles
set is_system=true
where (base_role='manager' and lower(name)='manager')
   or (base_role='staff' and lower(name)='staff');

-- Admin is protected and should always have the full permission catalog.
insert into public.role_permissions(role_id, permission_code)
select r.id, p.code
from public.roles r
join public.permissions p on true
where r.is_system=true and r.base_role='admin'
on conflict do nothing;

-- Seed Manager/Staff only when a default role has no permission rows yet. This
-- repairs businesses created by the previous two-role trigger without replacing
-- a client's intentional customization of an existing default role.
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
where r.is_system=true and r.base_role='manager'
  and not exists (select 1 from public.role_permissions rp where rp.role_id=r.id)
on conflict do nothing;

insert into public.role_permissions(role_id, permission_code)
select r.id, p.code
from public.roles r
join public.permissions p on p.code = any(array[
  'view_live_queue','add_customer','edit_customer','call_next_customer','return_last_customer',
  'move_to_serving','move_to_pending','complete_customer','mark_no_show'
])
where r.is_system=true and r.base_role='staff'
  and not exists (select 1 from public.role_permissions rp where rp.role_id=r.id)
on conflict do nothing;
