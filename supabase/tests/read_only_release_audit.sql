-- Read-only migration / PayMongo acceptance audit. Run on TEST.
-- Counts of migration versions are NOT equivalent to schema parity.
WITH fn AS (
 SELECT proname, prosecdef, has_function_privilege('anon',oid,'EXECUTE') AS anon_can_execute,
 has_function_privilege('authenticated',oid,'EXECUTE') AS user_can_execute,
 has_function_privilege('service_role',oid,'EXECUTE') AS service_can_execute,
 pg_get_functiondef(oid) LIKE '%pg_advisory_xact_lock%' AS advisory_lock,
 pg_get_functiondef(oid) LIKE '%FOR UPDATE%' AS row_lock
 FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace
 WHERE n.nspname='public' AND proname IN ('finalize_paymongo_checkout_atomic','finalize_paymongo_invoice_atomic')
)
SELECT 'payment_rpc_security' AS check_name,
 CASE WHEN count(*)=2 AND bool_and(prosecdef AND NOT anon_can_execute AND NOT user_can_execute AND service_can_execute AND advisory_lock AND row_lock)
 THEN 'PASS' ELSE 'FAIL' END AS result,
 jsonb_agg(to_jsonb(fn)) AS details FROM fn
UNION ALL
SELECT 'invoice_unique_index',CASE WHEN count(*)=1 THEN 'PASS' ELSE 'FAIL' END,
 jsonb_build_object('count',count(*))
FROM pg_indexes WHERE schemaname='public' AND indexname='payments_paymongo_invoice_unique_all'
UNION ALL
SELECT 'migration_history', 'INFO', jsonb_build_object('recorded_versions',count(*),'latest_version',max(version))
FROM supabase_migrations.schema_migrations;
