-- Reconciles production PayMongo atomic checkout and invoice RPCs with verified TEST definitions.
-- Apply only after production backup and dependency review.
-- Both RPCs enforce service_role at runtime and serialize duplicate PayMongo callbacks.

CREATE OR REPLACE FUNCTION public.finalize_paymongo_checkout_atomic(p_order_id uuid, p_payment_id text, p_amount numeric, p_currency text, p_paid_at timestamp with time zone, p_payment_method text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o public.subscription_orders%ROWTYPE; s public.business_subscriptions%ROWTYPE; prior public.payments%ROWTYPE; new_expiry timestamptz; change_plan boolean; billing text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role required'; END IF;
 IF p_order_id IS NULL OR nullif(p_payment_id,'') IS NULL OR p_amount IS NULL OR p_amount<=0 OR nullif(p_currency,'') IS NULL OR p_paid_at IS NULL THEN RAISE EXCEPTION 'invalid checkout'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('paymongo-order:'||p_order_id::text,0));
 SELECT * INTO o FROM public.subscription_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
 IF o.provider IS DISTINCT FROM 'paymongo' OR upper(o.currency)<>upper(p_currency) OR o.amount<>p_amount THEN RAISE EXCEPTION 'order payment mismatch'; END IF;
 SELECT * INTO prior FROM public.payments WHERE provider_payment_id=p_payment_id FOR UPDATE;
 IF FOUND AND (prior.subscription_order_id<>o.id OR prior.business_id<>o.business_id OR prior.amount<>p_amount OR upper(prior.currency)<>upper(p_currency)) THEN RAISE EXCEPTION 'payment id replay conflict'; END IF;
 SELECT * INTO s FROM public.business_subscriptions WHERE business_id=o.business_id FOR UPDATE;
 IF o.status='paid' THEN
   IF prior.id IS NULL THEN RAISE EXCEPTION 'paid order without matching payment'; END IF;
   RETURN jsonb_build_object('duplicate',true,'order_id',o.id);
 END IF;
 IF prior.id IS NOT NULL THEN RAISE EXCEPTION 'payment exists but order not finalized'; END IF;
 IF o.status NOT IN ('pending','checkout_created','failed') THEN RAISE EXCEPTION 'order cannot be finalized'; END IF;
 change_plan:=s.id IS NOT NULL AND s.plan_id IS DISTINCT FROM o.plan_id;
 billing:=CASE WHEN o.billing_interval='yearly' THEN 'yearly' ELSE 'monthly' END;
 new_expiry:=CASE WHEN billing='yearly' THEN (CASE WHEN NOT change_plan AND s.expires_at>p_paid_at THEN s.expires_at ELSE p_paid_at END)+interval '1 year'
 ELSE (CASE WHEN NOT change_plan AND s.expires_at>p_paid_at THEN s.expires_at ELSE p_paid_at END)+interval '1 month' END;
 INSERT INTO public.payments(business_id,subscription_order_id,provider,provider_payment_id,provider_reference,amount,subtotal,tax_mode,vat_rate,tax_amount,currency,payment_method,status,paid_at,metadata)
 VALUES(o.business_id,o.id,'paymongo',p_payment_id,o.id::text,p_amount,o.subtotal,o.tax_mode,o.vat_rate,o.tax_amount,p_currency,coalesce(nullif(p_payment_method,''),'online'),'paid',p_paid_at,coalesce(p_metadata,'{}'::jsonb));
 INSERT INTO public.business_subscriptions(business_id,plan_id,status,started_at,expires_at,billing_interval,renewal_mode,billing_currency,billing_price_monthly,billing_price_yearly,next_billing_at,paymongo_subscription_id,paymongo_customer_id,paymongo_plan_id,updated_at)
 VALUES(o.business_id,o.plan_id,'active',p_paid_at,new_expiry,billing,'manual',p_currency,
 CASE WHEN billing='monthly' THEN CASE WHEN o.tax_price_mode='inclusive' THEN o.amount ELSE o.subtotal END ELSE NULL END,
 CASE WHEN billing='yearly' THEN CASE WHEN o.tax_price_mode='inclusive' THEN o.amount ELSE o.subtotal END ELSE NULL END,
 NULL,NULL,NULL,NULL,now())
 ON CONFLICT(business_id) DO UPDATE SET plan_id=excluded.plan_id,status='active',started_at=excluded.started_at,expires_at=excluded.expires_at,billing_interval=excluded.billing_interval,renewal_mode='manual',billing_currency=excluded.billing_currency,
 billing_price_monthly=coalesce(excluded.billing_price_monthly,public.business_subscriptions.billing_price_monthly),
 billing_price_yearly=coalesce(excluded.billing_price_yearly,public.business_subscriptions.billing_price_yearly),
 next_billing_at=NULL,paymongo_subscription_id=NULL,paymongo_customer_id=NULL,paymongo_plan_id=NULL,updated_at=now(),
 custom_monthly_price=CASE WHEN change_plan THEN NULL ELSE public.business_subscriptions.custom_monthly_price END,
 custom_max_branches=CASE WHEN change_plan THEN NULL ELSE public.business_subscriptions.custom_max_branches END,
 custom_max_active_queues_per_branch=CASE WHEN change_plan THEN NULL ELSE public.business_subscriptions.custom_max_active_queues_per_branch END,
 custom_max_services_per_branch=CASE WHEN change_plan THEN NULL ELSE public.business_subscriptions.custom_max_services_per_branch END,
 custom_trial_days=CASE WHEN change_plan THEN NULL ELSE public.business_subscriptions.custom_trial_days END,
 custom_max_users=CASE WHEN change_plan THEN NULL ELSE public.business_subscriptions.custom_max_users END,
 custom_max_terminals=CASE WHEN change_plan THEN NULL ELSE public.business_subscriptions.custom_max_terminals END,
 override_reason=CASE WHEN change_plan THEN NULL ELSE public.business_subscriptions.override_reason END,
 override_expires_at=CASE WHEN change_plan THEN NULL ELSE public.business_subscriptions.override_expires_at END;
 UPDATE public.subscription_orders SET status='paid',updated_at=now() WHERE id=o.id;
 RETURN jsonb_build_object('duplicate',false,'order_id',o.id);
END $function$


CREATE OR REPLACE FUNCTION public.finalize_paymongo_invoice_atomic(p_invoice_id text, p_subscription_id text, p_payment_id text, p_amount numeric, p_currency text, p_next_billing timestamp with time zone, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
 IF o.amount <> p_amount THEN RAISE EXCEPTION 'invoice amount mismatch against authorized subscription order'; END IF;
 IF upper(coalesce(s.billing_currency,o.currency)) <> upper(p_currency) THEN RAISE EXCEPTION 'currency mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM public.payments WHERE provider_payment_id=p_payment_id) THEN RAISE EXCEPTION 'payment id already used'; END IF;
 interval_name := coalesce(s.billing_interval,o.billing_interval,'monthly');
 expiry := coalesce(p_next_billing,CASE WHEN interval_name='yearly' THEN now()+interval '1 year' ELSE now()+interval '1 month' END);
 IF s.id IS NOT NULL AND s.expires_at IS NOT NULL AND expiry <= s.expires_at THEN RAISE EXCEPTION 'invoice does not advance subscription expiration'; END IF;
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
END $function$

