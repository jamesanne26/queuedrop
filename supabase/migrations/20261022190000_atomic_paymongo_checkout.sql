CREATE OR REPLACE FUNCTION public.finalize_paymongo_checkout_atomic(
 p_order_id uuid,p_payment_id text,p_amount numeric,p_currency text,p_paid_at timestamptz,p_payment_method text,p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.finalize_paymongo_checkout_atomic(uuid,text,numeric,text,timestamptz,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_paymongo_checkout_atomic(uuid,text,numeric,text,timestamptz,text,jsonb) TO service_role;