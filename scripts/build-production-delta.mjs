import { readFileSync } from "node:fs";

// Emits a reviewed candidate; never connects to any database.
const sources = [
  "supabase/migrations/20261022180000_atomic_paymongo_invoice.sql",
  "supabase/migrations/20261022190000_atomic_paymongo_checkout.sql",
  "supabase/migrations/20261023110000_reconcile_support_return_path.sql",
  "supabase/migrations/20261023130000_paymongo_invoice_reference_uniqueness.sql",
];
const parts = sources.map(file => {
  const sql = readFileSync(file, "utf8")
    .replace(/^begin;\s*$/gim, "")
    .replace(/^commit;\s*$/gim, "")
    .replace(/^notify pgrst, 'reload schema';\s*$/gim, "");
  return "-- Source: " + file + "\n" + sql;
});
console.log(`-- Candidate only. Requires verified backup/restore and release approval.
-- Excludes TEST scheduler/network changes and migration-history edits.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $preflight$
BEGIN
 IF EXISTS (
   SELECT 1 FROM public.payments WHERE provider='paymongo'
   AND provider_reference IS NOT NULL
   AND (payment_method='subscription' OR provider_reference LIKE 'in_%')
   GROUP BY provider,provider_reference HAVING count(*)>1
 ) THEN RAISE EXCEPTION 'duplicate invoice references: reconcile before release'; END IF;
END $preflight$;
` + parts.join("\n\n") + `
DO $verify$
DECLARE passed boolean;
BEGIN
 SELECT count(*)=2 AND bool_and(p.prosecdef
   AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
   AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
   AND has_function_privilege('service_role',p.oid,'EXECUTE')
   AND position('pg_advisory_xact_lock' in pg_get_functiondef(p.oid))>0
   AND position('FOR UPDATE' in pg_get_functiondef(p.oid))>0)
 INTO passed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('finalize_paymongo_checkout_atomic','finalize_paymongo_invoice_atomic');
 IF passed IS DISTINCT FROM true THEN RAISE EXCEPTION 'payment RPC verification failed'; END IF;
 SELECT count(*)=2 AND bool_and(i.indisunique AND i.indisvalid AND i.indisready)
 INTO passed FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('payments_paymongo_invoice_unique_all','payments_paymongo_invoice_reference_unique');
 IF passed IS DISTINCT FROM true THEN RAISE EXCEPTION 'invoice index verification failed'; END IF;
 IF position('length(source) > 500' in pg_get_functiondef('public.support_return_path(text)'::regprocedure))=0
 THEN RAISE EXCEPTION 'support guard verification failed'; END IF;
END $verify$;
NOTIFY pgrst, 'reload schema';
COMMIT;
`);
