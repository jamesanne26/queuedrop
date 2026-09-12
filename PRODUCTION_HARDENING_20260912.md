# QueueDrop Production Hardening — 2026-09-12

This batch converts the current TEST-ready application into a safer production candidate without changing the core queue UX.

## Implemented in code

- Durable Postgres-backed abuse rate limiting for public kiosk ticket issuance, browser queue issuance, kiosk PIN attempts, and public SMS opt-in.
- Subscription enforcement on new tickets and continued queue-state operation. Expired workspaces can still complete/cancel/no-show existing customers so queues can be safely cleared.
- Daily subscription lifecycle reconciliation through a protected Vercel Cron endpoint.
- Production security headers: HSTS in production, anti-framing, MIME sniffing protection, referrer policy, permissions policy, COOP, and baseline CSP restrictions.
- No-store health endpoint with environment/revision metadata for uptime monitoring.
- Stub-first marketing copy aligned with the product: no required customer name; QR live status and SMS are optional.
- Legal baseline updated to remove pre-launch/internal wording and stale customer-name language; support/privacy contact is environment-configurable.
- Production environment validator (`npm run production:check`).
- Production launch checklist covering PROD Supabase/Vercel, PayMongo LIVE, SMS/email, backups, monitoring, and acceptance tests.
- Four new unit tests for rate-limit key/IP handling.

## New migration

`supabase/migrations/20260912033000_production_security_hardening.sql`

Apply this migration to TEST before browser regression tests, then to the dedicated PROD project during launch preparation.

## New production environment variable

`CRON_SECRET` — required by the subscription reconciliation endpoint and Vercel Cron.

## External setup still required before accepting general paying customers

The repository cannot create or approve third-party production accounts by itself. Before public sales, configure a dedicated PROD Supabase project, production Vercel environment/domain, PayMongo LIVE keys/webhook, production SMTP, real SMS provider settings, backup/PITR policy, monitored support email, and an external uptime/error-monitoring service.

Auto-renew is not a launch blocker. Keep `PAYMONGO_SUBSCRIPTIONS_ENABLED=false` until PayMongo enables the Subscriptions capability; Monthly/Annual manual renewal can be sold in the meantime.
