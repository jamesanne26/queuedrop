# QueueDrop Production Launch Checklist

This is the release gate for accepting paying customers. Do not use TEST Supabase, PayMongo TEST keys, or dry-run SMS in production.

## 1. Production infrastructure

- Create a dedicated PROD Supabase project. Keep TEST and PROD credentials separate.
- Apply every migration in `supabase/migrations` to PROD in order, including `20260912033000_production_security_hardening.sql`.
- Create a dedicated Vercel Production project/environment and map the final QueueDrop domain.
- Set all production environment variables using `.env.example` as the inventory. Never commit real secrets.
- Set `CRON_SECRET`; Vercel Cron calls `/api/internal/subscriptions/reconcile` daily.
- Run `npm run production:check` in a shell populated with PROD environment variables before go-live.

## 2. Billing

- Use PayMongo LIVE keys and create the LIVE webhook endpoint `/api/payments/paymongo/webhook`.
- Subscribe to the event types used by the webhook implementation. Manual hosted checkout can launch even if recurring Subscriptions capability is not yet enabled.
- Complete one controlled low-value LIVE payment and verify: payment record, order paid state, subscription activation, expiry date, and client access.
- If auto-renew is not approved by PayMongo yet, keep `PAYMONGO_SUBSCRIPTIONS_ENABLED=false` and sell Monthly/Annual with manual renewal.

## 3. SMS and email

- Configure the production SMS provider and set `SMS_DRY_RUN=false` only after one controlled real-message test.
- Configure the production sender name and verify one opted-in queue alert end-to-end.
- Configure Supabase production SMTP / transactional email for confirmation and password reset. `RESEND_API_KEY` is optional unless QueueDrop sends additional transactional mail itself.
- Set `QUEUEDROP_SUPPORT_EMAIL` to a monitored mailbox.

## 4. Security and abuse protection

- Public ticket issuance, browser queue issuance, kiosk PIN attempts, and public SMS opt-in are rate limited through Postgres.
- Production security headers are configured in `next.config.ts`.
- New tickets and non-terminal queue state transitions require an active/trialing subscription; completion/cancellation/no-show remains allowed so expired workspaces can safely clear customers already in progress.
- Keep the Supabase service-role key server-only. Never expose it using `NEXT_PUBLIC_*`.
- Review Supabase Auth redirect URLs and allow only production/test hosts that are actually needed.

## 5. Backups and recovery

- Enable the strongest Supabase backup/PITR option available on the selected production plan.
- Record the production project reference and backup policy in a private operator runbook.
- Before launch, perform one restore rehearsal into a non-production project and document the result/date.
- Export critical configuration (plans, SMS routes, business subscription state) before risky schema changes.

## 6. Monitoring and operations

- Monitor `/api/health` from an external uptime service.
- Enable Vercel runtime/function log retention appropriate for production.
- Add an error-monitoring provider such as Sentry when the production account/DSN is available; do not put DSNs or secrets in source control unless explicitly intended to be public.
- Configure alerts for repeated PayMongo webhook 5xx responses and SMS dispatcher failures.

## 7. Final acceptance test

Run `QueueDrop-Run-All-Tests.bat` and require all automated tests to pass. Then perform a controlled PROD smoke test:

1. Sign up and confirm email.
2. Create business/branch/service/team member/terminal.
3. Issue a real printed stub and scan its QR.
4. Add an optional mobile number and receive one SMS alert.
5. Exercise waiting → pending → serving → complete and reports/export.
6. Complete a LIVE PayMongo payment and verify the subscription period.
7. Confirm expired subscription behavior on a disposable test business.
8. Confirm System Owner can support the account without cross-tenant data leakage.

Only after these checks should QueueDrop accept general paying customers.
