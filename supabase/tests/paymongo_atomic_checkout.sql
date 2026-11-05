-- Run against TEST only. Rolls back every fixture and assertion.
BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $test$
DECLARE
 v_business uuid := '880d696f-38c2-4826-bbc6-c6398cac2abb';
 v_plan uuid := '592976f1-d593-46de-86e8-3cf8422557fc';
 v_order uuid := gen_random_uuid();
 v_payment text := 'pay_test_'||v_order::text;
 first_result jsonb;
 second_result jsonb;
 payment_count integer;
 before_expiry timestamptz;
 after_expiry timestamptz;
BEGIN
 SELECT expires_at INTO before_expiry FROM public.business_subscriptions WHERE business_id=v_business;
 INSERT INTO public.subscription_orders(id,business_id,plan_id,amount,subtotal,currency,provider,payment_mode,status,billing_interval,renewal_mode)
 VALUES(v_order,v_business,v_plan,499,499,'PHP','paymongo','online','checkout_created','monthly','manual');
 first_result:=public.finalize_paymongo_checkout_atomic(v_order,v_payment,499,'PHP',now(),'gcash','{}'::jsonb);
 second_result:=public.finalize_paymongo_checkout_atomic(v_order,v_payment,499,'PHP',now(),'gcash','{}'::jsonb);
 IF first_result->>'duplicate'<>'false' OR second_result->>'duplicate'<>'true' THEN RAISE EXCEPTION 'checkout idempotency assertion failed'; END IF;
 SELECT count(*) INTO payment_count FROM public.payments WHERE provider_payment_id=v_payment;
 IF payment_count<>1 THEN RAISE EXCEPTION 'expected exactly one payment'; END IF;
 SELECT expires_at INTO after_expiry FROM public.business_subscriptions WHERE business_id=v_business;
 IF after_expiry IS NULL OR after_expiry<=before_expiry THEN RAISE EXCEPTION 'subscription not extended'; END IF;
 BEGIN
  PERFORM public.finalize_paymongo_checkout_atomic(v_order,v_payment,500,'PHP',now(),'gcash','{}'::jsonb);
  RAISE EXCEPTION 'conflicting replay accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='conflicting replay accepted' THEN RAISE; END IF;
 END;
 RAISE NOTICE 'PASS: checkout idempotency, payment uniqueness, subscription extension, conflict rejection';
END $test$;
ROLLBACK;