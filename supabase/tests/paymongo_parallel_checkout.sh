#!/usr/bin/env bash
# Isolated local Supabase only. Exercise two independent concurrent checkout transactions.
set -euo pipefail
db="$(docker ps --format '{{.Names}}' | grep '^supabase_db_queuedrop$')"
psql_local() { docker exec -i "$db" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -At "$@"; }
suffix="$(date +%s)-$$"
business="$(psql_local -c "INSERT INTO public.businesses(name,slug) VALUES ('Parallel QA','parallel-qa-$suffix') RETURNING id" | sed -n '1p')"
plan="$(psql_local -c "INSERT INTO public.plans(name,price_monthly) VALUES ('Parallel QA $suffix',499) RETURNING id" | sed -n '1p')"
order="$(psql_local -c "INSERT INTO public.subscription_orders(business_id,plan_id,amount,subtotal,currency,provider,payment_mode,status,billing_interval,renewal_mode) VALUES ('$business','$plan',499,499,'PHP','paymongo','online','checkout_created','monthly','manual') RETURNING id" | sed -n '1p')"
payment="pay_parallel_$suffix"
cleanup() { psql_local -c "DELETE FROM public.payments WHERE business_id='$business'; DELETE FROM public.business_subscriptions WHERE business_id='$business'; DELETE FROM public.subscription_orders WHERE business_id='$business'; DELETE FROM public.businesses WHERE id='$business'; DELETE FROM public.plans WHERE id='$plan';" >/dev/null || true; }
trap cleanup EXIT
sql="BEGIN; SELECT set_config('request.jwt.claim.role','service_role',true); SELECT public.finalize_paymongo_checkout_atomic('$order','$payment',499,'PHP',now(),'gcash','{}'::jsonb); COMMIT;"
docker exec "$db" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c "$sql" >/tmp/paymongo-race-a.log 2>&1 &
a=$!
docker exec "$db" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c "$sql" >/tmp/paymongo-race-b.log 2>&1 &
b=$!
wait "$a"
wait "$b"
cat /tmp/paymongo-race-a.log /tmp/paymongo-race-b.log
counts="$(psql_local -F '|' -c "SELECT (SELECT count(*) FROM public.payments WHERE provider_payment_id='$payment'),(SELECT count(*) FROM public.business_subscriptions WHERE business_id='$business' AND status='active'),(SELECT status FROM public.subscription_orders WHERE id='$order')")"
test "$counts" = '1|1|paid'
grep -q '"duplicate": false' /tmp/paymongo-race-a.log /tmp/paymongo-race-b.log
grep -q '"duplicate": true' /tmp/paymongo-race-a.log /tmp/paymongo-race-b.log
echo 'PASS: concurrent checkout produced exactly one payment and one active subscription'
