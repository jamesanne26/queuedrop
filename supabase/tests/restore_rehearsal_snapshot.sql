-- Fingerprint complete synthetic billing rows without logging their contents.
WITH fixture AS (
 SELECT id FROM public.businesses WHERE slug LIKE 'restore-rehearsal-%'
), rows AS (
 SELECT 'businesses' AS name,to_jsonb(t)::text AS payload FROM public.businesses t WHERE id IN (SELECT id FROM fixture)
 UNION ALL SELECT 'plans',to_jsonb(t)::text FROM public.plans t WHERE name LIKE 'Restore Rehearsal %'
 UNION ALL SELECT 'subscription_orders',to_jsonb(t)::text FROM public.subscription_orders t WHERE business_id IN (SELECT id FROM fixture)
 UNION ALL SELECT 'payments',to_jsonb(t)::text FROM public.payments t WHERE business_id IN (SELECT id FROM fixture)
 UNION ALL SELECT 'business_subscriptions',to_jsonb(t)::text FROM public.business_subscriptions t WHERE business_id IN (SELECT id FROM fixture)
)
SELECT name,count(*),md5(string_agg(payload,E'\n' ORDER BY payload))
FROM rows GROUP BY name ORDER BY name;
