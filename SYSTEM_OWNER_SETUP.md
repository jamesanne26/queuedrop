# QueueDrop System Owner / Billing Setup

This build includes the customer queue portal, one-login role routing, System Owner console, configurable plans, per-client pricing/limit overrides, grandfathered monthly pricing, subscription checkout records, and PayMongo integration hooks.

## 1. Apply Supabase migrations to TEST first

```powershell
npx supabase db push --linked
```

New migrations in this package:

- `20260828130000_customer_portal_system_owner_billing.sql`
- `20260828140000_configurable_plans_and_client_overrides.sql`

Do not apply to Production until the Test environment passes.

## 2. Make your account a System Owner

Recommended database method:

```sql
insert into public.system_owners (user_id)
select id from auth.users where lower(email) = lower('YOUR_EMAIL_HERE')
on conflict (user_id) do update set is_active = true;
```

Alternative server environment allowlist:

```env
SYSTEM_OWNER_EMAILS=you@example.com
```

After login, a System Owner is routed to `/system`. Staff are routed to `/dashboard/queues`. Business Owner/Admin/Manager use `/dashboard`.

## 3. Configure plans

Open `/system/plans`.

You can change without code deployment:

- plan name and description
- monthly price
- annual price
- min/max branches
- active queues per branch
- total services per branch
- trial days
- public/private visibility
- whether new subscriptions are accepted
- display order

Default launch catalog:

- Starter — PHP 799/mo — 1 branch — 5 active queues/branch
- Growth — PHP 1,999/mo — up to 3 branches — 10 active queues/branch
- Business — PHP 3,499/mo — up to 5 branches — 15 active queues/branch
- Multi-Location — PHP 5,999/mo — up to 10 branches — 20 active queues/branch
- Enterprise — starts PHP 7,999/mo — custom limits

Plan price changes are grandfathered by default: existing subscriptions keep their locked billing price. Tick **Apply new monthly price to existing active subscribers** only when you intentionally want to change them.

## 4. Configure a specific client

Open `/system`, choose a business, then click **Configure**.

Per-client overrides support:

- monthly price
- branch limit
- active queue limit per branch
- service limit per branch
- trial days
- expiry date for the override
- internal reason/note

Blank override fields inherit the plan defaults.

## 5. PayMongo TEST setup

Set these in the TEST Vercel environment:

```env
NEXT_PUBLIC_SITE_URL=https://YOUR_TEST_DOMAIN
PAYMONGO_SECRET_KEY=sk_test_replace_me
PAYMONGO_WEBHOOK_SECRET=whsec_replace_me
```

Register the TEST webhook endpoint:

`https://YOUR_TEST_DOMAIN/api/payments/paymongo/webhook`

Run TEST payments first. Do not use live keys until checkout + webhook + subscription activation are verified end-to-end.

## 6. Customer flow to test

1. Scan/open a branch QueueDrop link.
2. Choose service and enter customer details.
3. Join queue.
4. Verify large position view, private queue list, auto-refresh, edit permissions, and 6-character leave code.
5. Verify staff Live Queue updates and customer popup.

## 7. Important behavior

New self-service business workspaces automatically receive the configurable Starter trial. Database triggers enforce branch/service/active-queue limits for subscribed/trialing businesses. Legacy TEST businesses that have no subscription remain unmetered until you assign a plan from System Owner.
