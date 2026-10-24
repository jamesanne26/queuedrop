-- Read-only migration / PayMongo acceptance audit. Run on TEST.
-- Counts of migration versions are NOT equivalent to schema parity.
WITH fn AS (
 SELECT proname, prosecdef, has_function_privilege('anon',p.oid,'EXECUTE') AS anon_can_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS user_can_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_can_execute,
 pg_get_functiondef(p.oid) LIKE '%pg_advisory_xact_lock%' AS advisory_lock,
 pg_get_functiondef(p.oid) LIKE '%FOR UPDATE%' AS row_lock
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
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
SELECT 'invoice_reference_unique_index',CASE WHEN count(*)=1 THEN 'PASS' ELSE 'FAIL' END,
 jsonb_build_object('count',count(*))
FROM pg_indexes WHERE schemaname='public' AND indexname='payments_paymongo_invoice_reference_unique'
UNION ALL
SELECT 'invoice_indexes_are_unique',
 CASE WHEN count(*)=2 AND bool_and(i.indisunique AND i.indisvalid AND i.indisready) THEN 'PASS' ELSE 'FAIL' END,
 jsonb_build_object('verified_indexes',count(*),'all_unique_valid_ready',coalesce(bool_and(i.indisunique AND i.indisvalid AND i.indisready),false))
FROM pg_index i
JOIN pg_class c ON c.oid=i.indexrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('payments_paymongo_invoice_unique_all','payments_paymongo_invoice_reference_unique')
UNION ALL
SELECT 'duplicate_paymongo_invoice_references',CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END,
 jsonb_build_object('duplicate_references',count(*))
FROM (
 SELECT provider_reference FROM public.payments
 WHERE provider='paymongo' AND provider_reference LIKE 'in_%'
 GROUP BY provider_reference HAVING count(*)>1
) duplicates
UNION ALL
SELECT 'support_return_path_length_guard',
 CASE WHEN to_regprocedure('public.support_return_path(text)') IS NOT NULL
 AND position('length(source) > 500' in pg_get_functiondef(to_regprocedure('public.support_return_path(text)'))) > 0
 THEN 'PASS' ELSE 'FAIL' END,
 jsonb_build_object('requires_500_character_limit',true)
UNION ALL
SELECT 'migration_history', 'INFO', jsonb_build_object('recorded_versions',count(*),'latest_version',max(version))
FROM supabase_migrations.schema_migrations;
