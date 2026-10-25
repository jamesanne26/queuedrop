#!/usr/bin/env bash
# Disposable local Supabase only. Two independent PostgreSQL sessions race on one invoice.
set -euo pipefail
db="$(docker ps --format '{{.Names}}' | grep '^supabase_db_queuedrop$')"
psql_local() { docker exec -i "$db" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -At "$@"; }
suffix="$(date +%s)-$$"
business="$(psql_local -c "INSERT INTO public.businesses(name,slug) VALUES ('Invoice QA','invoice-qa-$suffix') RETURNING id" | sed -n '1p')"
plan="$(psql_local -c "INSERT INTO public.plans(name,price_monthly) VALUES ('Invoice QA $suffix',499) RETURNING id" | sed -n '1p')"
sid="sub_parallel_$suffix"
invoice="in_parallel_$suffix"
payment="pay_parallel_invoice_$suffix"
order="$(psql_local -c "INSERT INTO public.subscription_orders(business_id,plan_id,amount,subtotal,currency,provider,payment_mode,status,billing_interval,renewal_mode,provider_subscription_id) VALUES ('$business','$plan',499,499,'PHP','paymongo','subscription','pending','monthly','auto','$sid') RETURNING id" | sed -n '1p')"
cleanup() { psql_local -c "DELETE FROM public.payments WHERE business_id='$business'; DELETE FROM public.business_subscriptions WHERE business_id='$business'; DELETE FROM public.subscription_orders WHERE business_id='$business'; DELETE FROM public.businesses WHERE id='$business'; DELETE FROM public.plans WHERE id='$plan';" >/dev/null || true; }
trap cleanup EXIT
sql="BEGIN; SELECT set_config('request.jwt.claim.role','service_role',true); SELECT public.finalize_paymongo_invoice_atomic('$invoice','$sid','$payment',499,'PHP',now()+interval '2 months','{}'::jsonb); COMMIT;"
docker exec "$db" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c "$sql" >/tmp/paymongo-invoice-race-a.log 2>&1 &
a=$!
docker exec "$db" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c "$sql" >/tmp/paymongo-invoice-race-b.log 2>&1 &
b=$!
wait "$a"
wait "$b"
cat /tmp/paymongo-invoice-race-a.log /tmp/paymongo-invoice-race-b.log
counts="$(psql_local -F '|' -c "SELECT (SELECT count(*) FROM public.payments WHERE provider_reference='$invoice'),(SELECT count(*) FROM public.business_subscriptions WHERE business_id='$business' AND status='active'),(SELECT status FROM public.subscription_orders WHERE id='$order')")"
test "$counts" = '1|1|paid'
grep -q '"duplicate": false' /tmp/paymongo-invoice-race-a.log /tmp/paymongo-invoice-race-b.log
grep -q '"duplicate": true' /tmp/paymongo-invoice-race-a.log /tmp/paymongo-invoice-race-b.log
echo 'PASS: concurrent invoice produced exactly one payment and one active subscription'
