-- Validate restored application grants and idempotency, not just table existence.
BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $verify$
DECLARE pay public.payments%ROWTYPE; result jsonb; checked integer := 0;
BEGIN
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN ('finalize_paymongo_checkout_atomic','finalize_paymongo_invoice_atomic')
     AND p.prosecdef AND has_function_privilege('service_role',p.oid,'EXECUTE')
     AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
     AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')) <> 2 THEN
   RAISE EXCEPTION 'restored payment RPC privileges are unsafe';
 END IF;
 FOR pay IN SELECT p.* FROM public.payments p JOIN public.businesses b ON b.id=p.business_id
            WHERE b.slug LIKE 'restore-rehearsal-%' LOOP
   checked := checked+1;
   result := public.finalize_paymongo_checkout_atomic(pay.subscription_order_id,pay.provider_payment_id,pay.amount,pay.currency,pay.paid_at,pay.payment_method,pay.metadata);
   IF result->>'duplicate' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'restored payment was processed again'; END IF;
 END LOOP;
 IF checked <> 1 THEN RAISE EXCEPTION 'expected one nonempty restore fixture, found %',checked; END IF;
END $verify$;
COMMIT;
