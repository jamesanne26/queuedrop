-- Disposable local Supabase only. Create committed data to exercise pg_dump.
BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $fixture$
DECLARE b uuid; p uuid; o uuid; tag text := gen_random_uuid()::text;
BEGIN
 INSERT INTO public.plans(name,price_monthly)
 VALUES('Restore Rehearsal '||tag,499) RETURNING id INTO p;
 INSERT INTO public.businesses(name,slug)
 VALUES('Restore Rehearsal','restore-rehearsal-'||tag) RETURNING id INTO b;
 INSERT INTO public.subscription_orders(business_id,plan_id,amount,subtotal,currency,provider,payment_mode,status,billing_interval,renewal_mode)
 VALUES(b,p,499,499,'PHP','paymongo','online','checkout_created','monthly','manual') RETURNING id INTO o;
 PERFORM public.finalize_paymongo_checkout_atomic(o,'pay_restore_'||tag,499,'PHP',now(),'gcash','{}'::jsonb);
END $fixture$;
COMMIT;
