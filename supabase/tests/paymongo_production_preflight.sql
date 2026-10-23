-- Read-only PayMongo deployment preflight. Safe to execute on TEST and PROD.
-- Compare results before deploying payment migrations. No data is modified.
SELECT 'payments_rows' AS check_name, count(*)::text AS observed FROM public.payments
UNION ALL SELECT 'subscription_orders_rows',count(*)::text FROM public.subscription_orders
UNION ALL SELECT 'business_subscriptions_rows',count(*)::text FROM public.business_subscriptions
UNION ALL SELECT 'duplicate_provider_payment_ids',count(*)::text FROM (SELECT provider_payment_id FROM public.payments WHERE provider_payment_id IS NOT NULL GROUP BY provider_payment_id HAVING count(*)>1) x
UNION ALL SELECT 'duplicate_paymongo_subscription_invoices',count(*)::text FROM (SELECT provider,provider_reference FROM public.payments WHERE provider='paymongo' AND payment_method='subscription' AND provider_reference IS NOT NULL GROUP BY provider,provider_reference HAVING count(*)>1) x
UNION ALL SELECT 'missing_atomic_checkout_function',CASE WHEN to_regprocedure('public.finalize_paymongo_checkout_atomic(uuid,text,numeric,text,timestamp with time zone,text,jsonb)') IS NULL THEN 'YES' ELSE 'NO' END
UNION ALL SELECT 'missing_atomic_invoice_function',CASE WHEN to_regprocedure('public.finalize_paymongo_invoice_atomic(text,text,text,numeric,text,timestamp with time zone,jsonb)') IS NULL THEN 'YES' ELSE 'NO' END
UNION ALL SELECT 'duplicate_paymongo_invoice_references_all_methods',count(*)::text FROM (SELECT provider_reference FROM public.payments WHERE provider='paymongo' AND provider_reference LIKE 'in_%' GROUP BY provider_reference HAVING count(*)>1) x
UNION ALL SELECT 'checkout_function_exposed_to_authenticated',CASE WHEN coalesce(has_function_privilege('authenticated',to_regprocedure('public.finalize_paymongo_checkout_atomic(uuid,text,numeric,text,timestamp with time zone,text,jsonb)'),'EXECUTE'),false) THEN 'YES' ELSE 'NO' END
UNION ALL SELECT 'invoice_function_exposed_to_authenticated',CASE WHEN coalesce(has_function_privilege('authenticated',to_regprocedure('public.finalize_paymongo_invoice_atomic(text,text,text,numeric,text,timestamp with time zone,jsonb)'),'EXECUTE'),false) THEN 'YES' ELSE 'NO' END
UNION ALL SELECT 'missing_invoice_unique_index',CASE WHEN to_regclass('public.payments_paymongo_invoice_unique_all') IS NULL THEN 'YES' ELSE 'NO' END
UNION ALL SELECT 'missing_invoice_reference_index',CASE WHEN to_regclass('public.payments_paymongo_invoice_reference_unique') IS NULL THEN 'YES' ELSE 'NO' END
ORDER BY check_name;
