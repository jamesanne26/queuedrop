BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $test$
DECLARE
 b uuid := '8bc28068-c400-4276-ab63-556f809425a9';
 p uuid := '592976f1-d593-46de-86e8-3cf8422557fc';
 o uuid := gen_random_uuid();
 sid text := 'sub_test_'||o::text;
 inv text := 'in_test_'||o::text;
 pid text := 'pay_test_'||o::text;
 a jsonb;
 d jsonb;
 n integer;
 old_expiry timestamptz;
 new_expiry timestamptz;
BEGIN
 SELECT expires_at INTO old_expiry FROM public.business_subscriptions WHERE business_id=b;
 INSERT INTO public.subscription_orders(id,business_id,plan_id,amount,subtotal,currency,provider,payment_mode,status,billing_interval,renewal_mode,provider_subscription_id)
 VALUES(o,b,p,499,499,'PHP','paymongo','subscription','pending','monthly','auto',sid);
 UPDATE public.business_subscriptions SET paymongo_subscription_id=sid,billing_currency='PHP',billing_interval='monthly' WHERE business_id=b;
 a:=public.finalize_paymongo_invoice_atomic(inv,sid,pid,499,'PHP',now()+interval '2 months','{}'::jsonb);
 d:=public.finalize_paymongo_invoice_atomic(inv,sid,pid,499,'PHP',now()+interval '2 months','{}'::jsonb);
 IF a->>'duplicate'<>'false' OR d->>'duplicate'<>'true' THEN RAISE EXCEPTION 'invoice duplicate failure'; END IF;
 SELECT count(*) INTO n FROM public.payments WHERE provider_reference=inv;
 IF n<>1 THEN RAISE EXCEPTION 'invoice payment count %',n; END IF;
 SELECT expires_at INTO new_expiry FROM public.business_subscriptions WHERE business_id=b;
 IF new_expiry<=old_expiry THEN RAISE EXCEPTION 'invoice expiry not extended'; END IF;
 RAISE NOTICE 'PASS invoice duplicate and expiry';
END $test$;
ROLLBACK;