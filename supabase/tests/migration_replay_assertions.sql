DO $$
DECLARE
  migration_count integer;
BEGIN
  SELECT count(*) INTO migration_count
  FROM supabase_migrations.schema_migrations;

  IF migration_count <> 98 THEN
    RAISE EXCEPTION 'Expected 98 migrations, found %', migration_count;
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
END;
$$;
