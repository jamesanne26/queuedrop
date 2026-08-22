-- QueueDrop LOCAL DEV seed data
-- Safe target: local Supabase only. Do not use this seed in PROD.
-- This file is automatically applied by `npx supabase db reset`.

-- -----------------------------------------------------------------------------
-- 1) Local-only test users
-- -----------------------------------------------------------------------------
-- LOCAL DEV ONLY. Shared password for all seeded accounts: QueueDrop123!
-- Ten client owners + one Anne Salon staff account.
-- Never reuse these credentials in TEST or PROD.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000001','authenticated','authenticated','anne.owner@queuedrop.local',crypt('QueueDrop123!', gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Anne Salon Owner","phone":"+639170000001"}'::jsonb,now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000002','authenticated','authenticated','brightsmile.owner@queuedrop.local',crypt('QueueDrop123!', gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"BrightSmile Dental Owner","phone":"+639170000002"}'::jsonb,now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000003','authenticated','authenticated','primecare.owner@queuedrop.local',crypt('QueueDrop123!', gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"PrimeCare Clinic Owner","phone":"+639170000003"}'::jsonb,now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000004','authenticated','authenticated','quickfix.owner@queuedrop.local',crypt('QueueDrop123!', gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"QuickFix Auto Center Owner","phone":"+639170000004"}'::jsonb,now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000005','authenticated','authenticated','sharpcuts.owner@queuedrop.local',crypt('QueueDrop123!', gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"SharpCuts Barbershop Owner","phone":"+639170000005"}'::jsonb,now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000006','authenticated','authenticated','freshfold.owner@queuedrop.local',crypt('QueueDrop123!', gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"FreshFold Laundry Owner","phone":"+639170000006"}'::jsonb,now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000007','authenticated','authenticated','techfix.owner@queuedrop.local',crypt('QueueDrop123!', gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"TechFix Repair Center Owner","phone":"+639170000007"}'::jsonb,now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000008','authenticated','authenticated','beautyhub.owner@queuedrop.local',crypt('QueueDrop123!', gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"BeautyHub Nail Salon Owner","phone":"+639170000008"}'::jsonb,now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000009','authenticated','authenticated','cityservice.owner@queuedrop.local',crypt('QueueDrop123!', gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"City Service Center Owner","phone":"+639170000009"}'::jsonb,now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000010','authenticated','authenticated','petcare.owner@queuedrop.local',crypt('QueueDrop123!', gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"PetCare Veterinary Clinic Owner","phone":"+639170000010"}'::jsonb,now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000101','authenticated','authenticated','anne.staff@queuedrop.local',crypt('QueueDrop123!', gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Anne Salon Staff","phone":"+639170000101"}'::jsonb,now(),now(),'','','','')
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
values
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','anne.owner@queuedrop.local',jsonb_build_object('sub','00000000-0000-4000-8000-000000000001','email','anne.owner@queuedrop.local','email_verified',true,'phone_verified',false),'email',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','brightsmile.owner@queuedrop.local',jsonb_build_object('sub','00000000-0000-4000-8000-000000000002','email','brightsmile.owner@queuedrop.local','email_verified',true,'phone_verified',false),'email',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003','primecare.owner@queuedrop.local',jsonb_build_object('sub','00000000-0000-4000-8000-000000000003','email','primecare.owner@queuedrop.local','email_verified',true,'phone_verified',false),'email',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000004','quickfix.owner@queuedrop.local',jsonb_build_object('sub','00000000-0000-4000-8000-000000000004','email','quickfix.owner@queuedrop.local','email_verified',true,'phone_verified',false),'email',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000005','sharpcuts.owner@queuedrop.local',jsonb_build_object('sub','00000000-0000-4000-8000-000000000005','email','sharpcuts.owner@queuedrop.local','email_verified',true,'phone_verified',false),'email',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000006','freshfold.owner@queuedrop.local',jsonb_build_object('sub','00000000-0000-4000-8000-000000000006','email','freshfold.owner@queuedrop.local','email_verified',true,'phone_verified',false),'email',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000007','techfix.owner@queuedrop.local',jsonb_build_object('sub','00000000-0000-4000-8000-000000000007','email','techfix.owner@queuedrop.local','email_verified',true,'phone_verified',false),'email',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000008','beautyhub.owner@queuedrop.local',jsonb_build_object('sub','00000000-0000-4000-8000-000000000008','email','beautyhub.owner@queuedrop.local','email_verified',true,'phone_verified',false),'email',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000009','cityservice.owner@queuedrop.local',jsonb_build_object('sub','00000000-0000-4000-8000-000000000009','email','cityservice.owner@queuedrop.local','email_verified',true,'phone_verified',false),'email',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000010','petcare.owner@queuedrop.local',jsonb_build_object('sub','00000000-0000-4000-8000-000000000010','email','petcare.owner@queuedrop.local','email_verified',true,'phone_verified',false),'email',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000101','anne.staff@queuedrop.local',jsonb_build_object('sub','00000000-0000-4000-8000-000000000101','email','anne.staff@queuedrop.local','email_verified',true,'phone_verified',false),'email',now(),now(),now())
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 2) Ten sample client businesses
-- -----------------------------------------------------------------------------
insert into public.businesses (id, name, slug, status)
values
  ('20000000-0000-4000-8000-000000000001', 'Anne Salon', 'anne-salon', 'active'),
  ('20000000-0000-4000-8000-000000000002', 'BrightSmile Dental', 'brightsmile-dental', 'active'),
  ('20000000-0000-4000-8000-000000000003', 'PrimeCare Clinic', 'primecare-clinic', 'active'),
  ('20000000-0000-4000-8000-000000000004', 'QuickFix Auto Center', 'quickfix-auto', 'active'),
  ('20000000-0000-4000-8000-000000000005', 'SharpCuts Barbershop', 'sharpcuts-barbershop', 'active'),
  ('20000000-0000-4000-8000-000000000006', 'FreshFold Laundry', 'freshfold-laundry', 'active'),
  ('20000000-0000-4000-8000-000000000007', 'TechFix Repair Center', 'techfix-repair', 'active'),
  ('20000000-0000-4000-8000-000000000008', 'BeautyHub Nail Salon', 'beautyhub-nails', 'active'),
  ('20000000-0000-4000-8000-000000000009', 'City Service Center', 'city-service-center', 'active'),
  ('20000000-0000-4000-8000-000000000010', 'PetCare Veterinary Clinic', 'petcare-vet', 'active')
on conflict (slug) do update set name = excluded.name, status = excluded.status;

-- One distinct owner per client business.
insert into public.business_users (business_id, user_id, role)
values
  ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','owner'),
  ('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','owner'),
  ('20000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003','owner'),
  ('20000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000004','owner'),
  ('20000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000005','owner'),
  ('20000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000006','owner'),
  ('20000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000007','owner'),
  ('20000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000008','owner'),
  ('20000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000009','owner'),
  ('20000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000010','owner')
on conflict (business_id, user_id) do update set role = excluded.role;

-- Dedicated staff account belongs to Anne Salon only.
insert into public.business_users (business_id, user_id, role)
values ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101','staff')
on conflict (business_id, user_id) do update set role = excluded.role;

-- -----------------------------------------------------------------------------
-- 3) Sample branches
-- -----------------------------------------------------------------------------
insert into public.branches (id, business_id, name, slug, status, address, phone, timezone)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Commonwealth', 'commonwealth', 'active', 'Commonwealth Ave, Quezon City', '+63281230001', 'Asia/Manila'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Cubao', 'cubao', 'active', 'Cubao, Quezon City', '+63281230002', 'Asia/Manila'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'Fairview', 'fairview', 'active', 'Fairview, Quezon City', '+63281230003', 'Asia/Manila'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', 'Batasan', 'batasan', 'active', 'Batasan Hills, Quezon City', '+63281230004', 'Asia/Manila'),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000003', 'Commonwealth', 'commonwealth', 'active', 'Commonwealth, Quezon City', '+63281230005', 'Asia/Manila'),
  ('30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000004', 'Quezon Avenue', 'quezon-avenue', 'active', 'Quezon Avenue, Quezon City', '+63281230006', 'Asia/Manila'),
  ('30000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000005', 'Cubao', 'cubao', 'active', 'Aurora Blvd, Cubao', '+63281230007', 'Asia/Manila'),
  ('30000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000006', 'Project 4', 'project-4', 'active', 'Project 4, Quezon City', '+63281230008', 'Asia/Manila'),
  ('30000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000007', 'Cubao', 'cubao', 'active', 'Araneta City, Cubao', '+63281230009', 'Asia/Manila'),
  ('30000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000008', 'Eastwood', 'eastwood', 'active', 'Eastwood City, Quezon City', '+63281230010', 'Asia/Manila'),
  ('30000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000009', 'Main Office', 'main-office', 'active', 'Quezon City Hall Complex', '+63281230011', 'Asia/Manila'),
  ('30000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000010', 'Commonwealth', 'commonwealth', 'active', 'Commonwealth, Quezon City', '+63281230012', 'Asia/Manila')
on conflict (business_id, slug) do update set
  name = excluded.name,
  status = excluded.status,
  address = excluded.address,
  phone = excluded.phone,
  timezone = excluded.timezone;

-- Each owner is a member only of branches belonging to their own business.
insert into public.branch_users (branch_id, user_id)
select br.id, bu.user_id
from public.branches br
join public.business_users bu
  on bu.business_id = br.business_id
 and bu.role = 'owner'::public.user_role
where br.id between '30000000-0000-4000-8000-000000000001'::uuid
                and '30000000-0000-4000-8000-000000000012'::uuid
on conflict (branch_id, user_id) do nothing;

-- Dedicated staff operates Anne Salon Commonwealth only.
insert into public.branch_users (branch_id, user_id)
values ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101')
on conflict (branch_id, user_id) do nothing;

-- -----------------------------------------------------------------------------
-- 4) Queue configurations
-- -----------------------------------------------------------------------------
insert into public.queue_configurations (
  branch_id, ticket_prefix, starting_number, no_show_minutes,
  allow_qr_join, is_active, show_branch_contact
)
select
  br.id,
  'Q',
  1,
  5,
  true,
  true,
  true
from public.branches br
where br.id between '30000000-0000-4000-8000-000000000001'::uuid
                and '30000000-0000-4000-8000-000000000012'::uuid
on conflict (branch_id) do update set
  ticket_prefix = excluded.ticket_prefix,
  starting_number = excluded.starting_number,
  no_show_minutes = excluded.no_show_minutes,
  allow_qr_join = excluded.allow_qr_join,
  is_active = excluded.is_active,
  show_branch_contact = excluded.show_branch_contact;

-- -----------------------------------------------------------------------------
-- 5) Services across different industries
-- -----------------------------------------------------------------------------
insert into public.services (id, branch_id, name, description, queue_prefix, estimated_minutes, is_active)
values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Haircut', 'Standard haircut service', 'HC', 30, true),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'Hair Spa', 'Hair treatment and spa', 'HS', 45, true),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'Hair Color', 'Hair coloring service', 'CL', 90, true),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000002', 'Haircut', 'Standard haircut service', 'HC', 30, true),
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000002', 'Manicure', 'Basic manicure', 'MN', 35, true),

  ('40000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000003', 'Dental Consultation', 'General dental consultation', 'DC', 20, true),
  ('40000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000003', 'Cleaning', 'Dental cleaning', 'CL', 40, true),
  ('40000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000004', 'Dental Consultation', 'General dental consultation', 'DC', 20, true),

  ('40000000-0000-4000-8000-000000000009', '30000000-0000-4000-8000-000000000005', 'General Consultation', 'Primary care consultation', 'GC', 20, true),
  ('40000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000005', 'Laboratory', 'Basic laboratory service', 'LB', 15, true),

  ('40000000-0000-4000-8000-000000000011', '30000000-0000-4000-8000-000000000006', 'Oil Change', 'Engine oil change', 'OC', 45, true),
  ('40000000-0000-4000-8000-000000000012', '30000000-0000-4000-8000-000000000006', 'Inspection', 'Vehicle inspection', 'IN', 30, true),

  ('40000000-0000-4000-8000-000000000013', '30000000-0000-4000-8000-000000000007', 'Haircut', 'Barbershop haircut', 'HC', 25, true),
  ('40000000-0000-4000-8000-000000000014', '30000000-0000-4000-8000-000000000007', 'Shave', 'Traditional shave', 'SH', 20, true),

  ('40000000-0000-4000-8000-000000000015', '30000000-0000-4000-8000-000000000008', 'Wash and Dry', 'Regular wash and dry', 'WD', 60, true),
  ('40000000-0000-4000-8000-000000000016', '30000000-0000-4000-8000-000000000008', 'Pickup Release', 'Laundry pickup/release counter', 'PR', 10, true),

  ('40000000-0000-4000-8000-000000000017', '30000000-0000-4000-8000-000000000009', 'Phone Repair', 'Mobile phone diagnostics and repair', 'PH', 45, true),
  ('40000000-0000-4000-8000-000000000018', '30000000-0000-4000-8000-000000000009', 'Laptop Repair', 'Laptop diagnostics and repair', 'LP', 60, true),

  ('40000000-0000-4000-8000-000000000019', '30000000-0000-4000-8000-000000000010', 'Manicure', 'Basic manicure', 'MN', 35, true),
  ('40000000-0000-4000-8000-000000000020', '30000000-0000-4000-8000-000000000010', 'Pedicure', 'Basic pedicure', 'PD', 40, true),

  ('40000000-0000-4000-8000-000000000021', '30000000-0000-4000-8000-000000000011', 'Document Request', 'Public document request', 'DR', 15, true),
  ('40000000-0000-4000-8000-000000000022', '30000000-0000-4000-8000-000000000011', 'Payment Counter', 'Payment processing', 'PC', 10, true),

  ('40000000-0000-4000-8000-000000000023', '30000000-0000-4000-8000-000000000012', 'Pet Consultation', 'Veterinary consultation', 'VC', 25, true),
  ('40000000-0000-4000-8000-000000000024', '30000000-0000-4000-8000-000000000012', 'Vaccination', 'Pet vaccination', 'VX', 15, true)
on conflict (branch_id, name) do update set
  description = excluded.description,
  queue_prefix = excluded.queue_prefix,
  estimated_minutes = excluded.estimated_minutes,
  is_active = excluded.is_active;

-- -----------------------------------------------------------------------------
-- 6) Operating hours: Mon-Sat 09:00-18:00, Sunday closed
-- day_of_week follows PostgreSQL extract(dow): Sunday=0 ... Saturday=6
-- -----------------------------------------------------------------------------
insert into public.operating_hours (branch_id, day_of_week, is_open, open_time, close_time)
select br.id,
       d.day_of_week,
       case when br.id = '30000000-0000-4000-8000-000000000001'::uuid then true else (d.day_of_week <> 0) end,
       case when br.id = '30000000-0000-4000-8000-000000000001'::uuid then '00:00'::time when d.day_of_week <> 0 then '09:00'::time else null end,
       case when br.id = '30000000-0000-4000-8000-000000000001'::uuid then '23:59'::time when d.day_of_week <> 0 then '18:00'::time else null end
from public.branches br
cross join generate_series(0, 6) as d(day_of_week)
where br.id between '30000000-0000-4000-8000-000000000001'::uuid
                and '30000000-0000-4000-8000-000000000012'::uuid
on conflict (branch_id, day_of_week) do update set
  is_open = excluded.is_open,
  open_time = excluded.open_time,
  close_time = excluded.close_time;

-- -----------------------------------------------------------------------------
-- 7) Ready-made queue for Anne Salon / Commonwealth
-- -----------------------------------------------------------------------------
-- Creates customer records, customer sessions, queue session, counters,
-- tickets and ticket events using the same public queue RPC used by the app.
do $$
begin
  if not exists (
    select 1
    from public.tickets t
    where t.branch_id = '30000000-0000-4000-8000-000000000001'::uuid
  ) then
    perform public.join_public_queue('anne-salon', 'commonwealth', '40000000-0000-4000-8000-000000000001', 'Maria Santos', '+639171111001');
    perform public.join_public_queue('anne-salon', 'commonwealth', '40000000-0000-4000-8000-000000000001', 'Juan Dela Cruz', '+639171111002');
    perform public.join_public_queue('anne-salon', 'commonwealth', '40000000-0000-4000-8000-000000000001', 'Ana Reyes', '+639171111003');
    perform public.join_public_queue('anne-salon', 'commonwealth', '40000000-0000-4000-8000-000000000001', 'Paolo Garcia', '+639171111004');
    perform public.join_public_queue('anne-salon', 'commonwealth', '40000000-0000-4000-8000-000000000002', 'Bea Mendoza', '+639171112001');
    perform public.join_public_queue('anne-salon', 'commonwealth', '40000000-0000-4000-8000-000000000002', 'Carlo Ramos', '+639171112002');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8) Helpful DEV-only audit marker
-- -----------------------------------------------------------------------------
insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
values (
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'dev.seed_loaded',
  'business',
  '20000000-0000-4000-8000-000000000001',
  jsonb_build_object('note', 'QueueDrop local development seed loaded', 'business_count', 10)
);

-- Milestone 7.1 DEV defaults: make Anne Salon / Commonwealth easy to test.
update public.queue_configurations
set customer_can_edit_name = true,
    customer_can_edit_mobile = true,
    staff_can_edit_name = true,
    staff_can_edit_mobile = true,
    manager_can_edit_name = true,
    manager_can_edit_mobile = true
where branch_id = '30000000-0000-4000-8000-000000000001'::uuid;

insert into public.position_notification_rules(branch_id, position, send_sms_once, browser_notification)
values
  ('30000000-0000-4000-8000-000000000001', 2, true, true),
  ('30000000-0000-4000-8000-000000000001', 1, false, true)
on conflict (branch_id, position) do update set
  send_sms_once = excluded.send_sms_once,
  browser_notification = excluded.browser_notification;
