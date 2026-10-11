DO $$
DECLARE
  migration_count integer;
  expected_indexes text[] := ARRAY[
    'idx_branch_users_user_branch',
    'idx_branches_business_created',
    'idx_business_users_business_created',
    'idx_business_users_user_active',
    'idx_notifications_branch_created',
    'uq_notifications_queue_position_once',
    'idx_operating_hours_branch_day',
    'idx_position_rules_branch_position',
    'idx_queue_configurations_branch_edit_flags',
    'idx_services_branch_active_created',
    'idx_tickets_branch_status_created_desc',
    'idx_tickets_branch_status_joined'
  ];
BEGIN
  SELECT count(*) INTO migration_count
  FROM supabase_migrations.schema_migrations;

  IF migration_count <> 104 THEN
    RAISE EXCEPTION 'Expected 104 migrations, found %', migration_count;
  END IF;

  IF to_regclass('public.businesses') IS NULL
     OR to_regclass('public.branches') IS NULL
     OR to_regclass('public.tickets') IS NULL
     OR to_regclass('public.print_jobs') IS NULL
     OR to_regclass('public.support_reports') IS NULL
     OR to_regclass('support_private.attachments') IS NULL
     OR to_regclass('public.platform_public_contact') IS NULL
     OR to_regclass('public.branch_tv_settings') IS NULL
     OR to_regclass('public.worker_runs') IS NULL THEN
    RAISE EXCEPTION 'A required QueueDrop table is missing after replay';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'A required scheduler/network extension is missing after replay';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'branch_users'
      AND policyname = 'Scoped members can view branch users'
  ) THEN
    RAISE EXCEPTION 'Branch-scoped visibility policy is missing after replay';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'branch_users'
      AND policyname = 'Business members can view branch users'
  ) THEN
    RAISE EXCEPTION 'The superseded broad branch visibility policy remains';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = ANY (ARRAY[
        'sms_delivery_attempts',
        'sms_delivery_methods',
        'sms_gateway_devices',
        'sms_routing_rules'
      ])
      AND grantee IN ('anon', 'authenticated')
  ) THEN
    RAISE EXCEPTION 'Client roles retain direct grants on SMS operational tables';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.sms_delivery_attempts'),
      ('public.sms_delivery_methods'),
      ('public.sms_gateway_devices'),
      ('public.sms_routing_rules')
    ) AS sms(table_name)
    WHERE NOT has_table_privilege('service_role', sms.table_name, 'SELECT')
       OR NOT has_table_privilege('service_role', sms.table_name, 'INSERT')
  ) THEN
    RAISE EXCEPTION 'service_role is missing required SMS operational table grants';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = ANY (expected_indexes)
  ) <> cardinality(expected_indexes) THEN
    RAISE EXCEPTION 'A Production performance/uniqueness index is missing after replay';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND conname = 'notifications_queue_position_check'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'Queue position CHECK constraint is missing or unvalidated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.support_return_path(text)')
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Support return-path RPC is missing or its expected client grants are absent';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(p.proacl) acl
    WHERE p.oid = 'public.support_return_path(text)'::regprocedure
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Support return-path RPC must not grant EXECUTE to PUBLIC';
  END IF;
END;
$$;
