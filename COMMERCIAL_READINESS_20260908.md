# QueueDrop commercial-readiness hardening — 2026-09-08

Implemented in this package:
- 14-day Starter trial remains part of self-service onboarding.
- Subscription expiry is enforced from `expires_at` even before a scheduler updates the stored status.
- Expired/past-due/cancelled subscribed workspaces cannot add branches, services, active team members, or ticket terminals.
- Plan limits now cover branches, services/active queues, active users, and ticket terminals at the database boundary.
- Added an idempotent lifecycle reconciliation function for a future scheduled job.
- PayMongo webhook hardened for invalid JSON, signature validation, amount/currency mismatch, duplicate payment delivery, DB failures, and safe month extension.
- Added baseline Terms, Privacy, and Cancellation/Refund pages and public footer links.
- Added billing unit tests and production environment placeholders.

Still requires external configuration / human verification before public sale:
1. Apply the new Supabase migration to TEST, rerun integration/E2E, then apply to PROD only after TEST is green.
2. Configure PayMongo TEST keys + webhook URL and complete one sandbox checkout end-to-end.
3. Configure a separate Production Supabase project, production Vercel project/domain/secrets, backups, monitoring, and provider credentials. Never reuse TEST service-role credentials in PROD.
4. Complete one controlled real Semaphore SMS to an authorized test number. Keep `SMS_DRY_RUN=true` until that test is intentionally started.
5. Configure Resend/domain authentication and implement/verify desired welcome and billing emails. PayMongo checkout currently requests its own payment receipt.
6. Have the legal/privacy pages reviewed and replace placeholder support/privacy contact details before public launch.
7. Decide recurring billing policy. The current checkout is a one-month purchase/renewal flow; it does not claim automatic card charging.
8. Run production acceptance: signup → trial → setup → queue → SMS → reports → checkout → webhook activation → limits → expiry/renewal.

## Billing cadence and renewal mode (2026-09-11)

QueueDrop now supports client-selected monthly or annual billing and manual or automatic renewal.

- Manual renewal keeps Hosted Checkout and supports card/GCash.
- Annual manual checkout uses the System Owner's `price_yearly` and extends access by one calendar year.
- Auto-renew uses PayMongo Subscriptions and card authorization; it is gated by `PAYMONGO_SUBSCRIPTIONS_ENABLED=true` and `NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY` so existing manual checkout is unaffected until PayMongo enables the merchant capability.
- Auto-renew webhook handling covers paid subscription invoices and subscription status changes (`active`, `past_due`/`unpaid`, `cancelled`).
- System Owner can allow/disable auto-renew per plan.

PayMongo dashboard webhook configuration must include subscription events before auto-renew is enabled: `subscription.invoice.paid`, `subscription.updated`, `subscription.past_due`, and `subscription.unpaid`.

## Configurable plan tax (2026-09-11)
- System Owner can mark each plan Non-VAT or VAT.
- VAT rate is configurable from 0-100% (not hard-coded).
- VAT plans can be price-inclusive or price-exclusive.
- Every subscription order snapshots subtotal, tax mode, VAT rate, tax amount, and total so historical billing does not change when plan tax settings change later.
- PayMongo is charged the snapshotted total; billing history shows the tax treatment.
