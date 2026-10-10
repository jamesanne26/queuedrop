-- Restore the permission catalog only when a clean rebuild has removed every row.
-- Existing installations with customized catalogs and role grants are left untouched.

do $$
begin
  if not exists (select 1 from public.permissions) then
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
      ('manage_kiosk_display', 'Manage kiosk & display', 'Configure kiosk and display board options.', 'Management', 370),
      ('manage_operating_hours', 'Manage operating hours', 'Change branch operating hours.', 'Management', 380),
      ('manage_position_notifications', 'Manage position notifications', 'Change position-based notification rules.', 'Management', 390),
      ('manage_queue_information', 'Manage queue information settings', 'Change queue/customer information visibility and editing rules.', 'Management', 400),
      ('view_audit_logs', 'View audit logs', 'View security and administrative audit logs.', 'Security', 410);

    insert into public.role_permissions(role_id, permission_code)
    select r.id, p.code
    from public.roles r cross join public.permissions p
    where r.is_system and r.base_role in ('owner', 'admin')
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
    where r.is_system and r.base_role = 'manager'
    on conflict do nothing;

    insert into public.role_permissions(role_id, permission_code)
    select r.id, p.code
    from public.roles r
    join public.permissions p on p.code = any(array[
      'view_live_queue','add_customer','edit_customer','call_next_customer','return_last_customer',
      'move_to_serving','move_to_pending','complete_customer','mark_no_show'
    ])
    where r.is_system and r.base_role = 'staff'
    on conflict do nothing;
  end if;
end $$;
