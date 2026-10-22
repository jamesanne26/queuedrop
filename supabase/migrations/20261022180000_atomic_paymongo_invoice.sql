CREATE UNIQUE INDEX IF NOT EXISTS payments_paymongo_invoice_unique_all
ON public.payments(provider,provider_reference)
WHERE provider='paymongo' AND payment_method='subscription' AND provider_reference IS NOT NULL;

CREATE OR REPLACE FUNCTION public.finalize_paymongo_invoice_atomic(
 p_invoice_id text,p_subscription_id text,p_payment_id text,p_amount numeric,p_currency text,
 p_next_billing timestamptz,p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 s public.business_subscriptions%ROWTYPE;
 o public.subscription_orders%ROWTYPE;
 pay public.payments%ROWTYPE;
 new_order_id uuid;
 expiry timestamptz;
 interval_name text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role required'; END IF;
 IF nullif(p_invoice_id,'') IS NULL OR nullif(p_subscription_id,'') IS NULL OR nullif(p_payment_id,'') IS NULL OR p_amount <= 0 OR p_currency IS NULL THEN
   RAISE EXCEPTION 'invalid invoice';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('paymongo-invoice:'||p_invoice_id,0));
 SELECT * INTO pay FROM public.payments WHERE provider='paymongo' AND provider_reference=p_invoice_id AND payment_method='subscription' FOR UPDATE;
 IF FOUND THEN
   IF pay.provider_payment_id IS DISTINCT FROM p_payment_id OR pay.amount <> p_amount OR pay.currency <> p_currency THEN
     RAISE EXCEPTION 'conflicting invoice replay';
   END IF;
   RETURN jsonb_build_object('duplicate',true,'order_id',pay.subscription_order_id);
 END IF;
 SELECT * INTO s FROM public.business_subscriptions WHERE paymongo_subscription_id=p_subscription_id FOR UPDATE;
 SELECT * INTO o FROM public.subscription_orders WHERE provider_subscription_id=p_subscription_id ORDER BY created_at ASC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'subscription setup order missing'; END IF;
 IF s.id IS NULL AND o.amount <> p_amount THEN RAISE EXCEPTION 'initial invoice amount mismatch'; END IF;
 IF upper(coalesce(s.billing_currency,o.currency)) <> upper(p_currency) THEN RAISE EXCEPTION 'currency mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM public.payments WHERE provider_payment_id=p_payment_id) THEN RAISE EXCEPTION 'payment id already used'; END IF;
 interval_name := coalesce(s.billing_interval,o.billing_interval,'monthly');
 expiry := coalesce(p_next_billing,CASE WHEN interval_name='yearly' THEN now()+interval '1 year' ELSE now()+interval '1 month' END);
 IF s.id IS NOT NULL AND s.expires_at IS NOT NULL AND expiry < s.expires_at THEN RAISE EXCEPTION 'invoice would shorten subscription'; END IF;
 IF o.status <> 'paid' AND s.id IS NULL THEN
   new_order_id := o.id;
 ELSE
   INSERT INTO public.subscription_orders(business_id,plan_id,requested_by,amount,subtotal,tax_mode,vat_rate,tax_amount,tax_price_mode,currency,billing_interval,renewal_mode,payment_mode,provider,provider_subscription_id,provider_customer_id,provider_plan_id,status)
   VALUES(coalesce(s.business_id,o.business_id),coalesce(s.plan_id,o.plan_id),null,p_amount,o.subtotal,o.tax_mode,o.vat_rate,o.tax_amount,o.tax_price_mode,p_currency,interval_name,'auto','subscription','paymongo',p_subscription_id,coalesce(s.paymongo_customer_id,o.provider_customer_id),coalesce(s.paymongo_plan_id,o.provider_plan_id),'paid') RETURNING id INTO new_order_id;
 END IF;
 INSERT INTO public.payments(business_id,subscription_order_id,provider,provider_payment_id,provider_reference,amount,subtotal,tax_mode,vat_rate,tax_amount,currency,payment_method,status,paid_at,metadata)
 VALUES(coalesce(s.business_id,o.business_id),new_order_id,'paymongo',p_payment_id,p_invoice_id,p_amount,o.subtotal,o.tax_mode,o.vat_rate,o.tax_amount,p_currency,'subscription','paid',now(),coalesce(p_metadata,'{}'::jsonb));
 INSERT INTO public.business_subscriptions(business_id,plan_id,status,billing_interval,renewal_mode,billing_currency,paymongo_subscription_id,paymongo_customer_id,paymongo_plan_id,next_billing_at,expires_at,started_at,updated_at)
 VALUES(coalesce(s.business_id,o.business_id),coalesce(s.plan_id,o.plan_id),'active',interval_name,'auto',p_currency,p_subscription_id,coalesce(s.paymongo_customer_id,o.provider_customer_id),coalesce(s.paymongo_plan_id,o.provider_plan_id),expiry,expiry,now(),now())
 ON CONFLICT (business_id) DO UPDATE SET plan_id=excluded.plan_id,status='active',billing_interval=excluded.billing_interval,renewal_mode='auto',billing_currency=excluded.billing_currency,paymongo_subscription_id=excluded.paymongo_subscription_id,paymongo_customer_id=excluded.paymongo_customer_id,paymongo_plan_id=excluded.paymongo_plan_id,next_billing_at=excluded.next_billing_at,expires_at=excluded.expires_at,updated_at=now();
 UPDATE public.subscription_orders SET status='paid',updated_at=now() WHERE id=new_order_id;
 RETURN jsonb_build_object('duplicate',false,'order_id',new_order_id);
END $$;
REVOKE ALL ON FUNCTION public.finalize_paymongo_invoice_atomic(text,text,text,numeric,text,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_paymongo_invoice_atomic(text,text,text,numeric,text,timestamptz,jsonb) TO service_role;