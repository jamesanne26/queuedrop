# QueueDrop reliability release — TEST only

Baseline: test commit 4173818f46784cca3e33ca4a3873ecb12027f8a7.
Do not merge into production until hosted CI and physical printer checks pass.

## Changes and evidence

| Problem | Change | Automated verification |
| --- | --- | --- |
| Cancelled tickets still print on reconnect | Cancel jobs on status change; claims and confirmations reject inactive/expired tickets | Real PostgreSQL migration tests and printer browser regression |
| Lost print confirmation causes duplicate paper | Abandoned claimed jobs become uncertain; operator checks paper before reprinting the same ticket | Database tests and browser reprint regression |
| Lost kiosk response creates another ticket | UUID request deduplication, submission guard, 15-second timeout, session storage recovery | Database dedup tests and lost-response/reload browser regression |
| Queue numbers truncate after 999 | Preserve all digits in database issuance functions | Database and hosted formatter tests; browser starts at 1000 |
| Queue disappears after 250 tickets | Fetch ordered pages instead of a 250-row cap; retain last good client state on failure | Pagination tests through 1251 records and partial-fetch failure |
| Background cleanup stops on expired subscriptions | Permit not_completed cleanup, idempotent close-of-day processing, respect overnight closing | Database tests for expired clients, closing boundaries, overnight sessions |
| SMS timeout or confirmation failure duplicates messages | Ambiguous delivery stops provider fallback and requires review; obsolete tickets suppressed | Actual dispatcher tests with mocked provider and database |
| Health endpoint hides database outage | Readiness checks database; liveness is separate | Unit readiness tests, hosted smoke and deployment revision gate |
| Silent missed background work | Authenticated operations endpoint, worker heartbeats, system owner diagnostics | Build/type checks; scheduler and heartbeat acceptance checks below |
| Missing secrets / older deployment look green | Required hosted tests; wait for exact deployment SHA and ready database; always upload browser reports | TEST workflows; CI fails flaky tests even after retry |

## Local validation

Use Node 24. Run `npm ci`, `npm run test:fast`, and `npm run build`.
`npm test` now runs unit, PostgreSQL regression and SMS suites.
PostgreSQL tests use PGlite with a minimal fixture schema and the actual new migration;
they do not substitute for hosted Supabase RLS/integration tests.
`npm run test:unit:coverage` produces unit coverage diagnostics.
Configure `.env.test.local` from the example to run required hosted integration and browser tests.
Without TEST credentials, local browser/hosted tests are not verified.

## TEST deployment

1. Apply `supabase/migrations/20261006050000_queue_reliability.sql` to the dedicated TEST Supabase project in one transaction.
   GitHub TEST checks can do this automatically when `QUEUEDROP_TEST_DATABASE_URL` is present.
   The script verifies the database connection matches `QUEUEDROP_TEST_SUPABASE_URL` and only runs on branch test.
   Alternatively use the TEST Supabase SQL editor with `BEGIN;` / `COMMIT;` around the migration.
2. Existing TEST secrets for app URL, Supabase URL/keys and owner credentials remain required.
   TEST deployment URL expected by CI: https://queuedrop-test.vercel.app.
3. Push branch test only. Vercel deploys the TEST project. CI waits for health to report this commit SHA and database readiness.
4. Require all Quality, QueueDrop CI, QueueDrop TEST checks, TEST Integration and Browser E2E runs to pass.
   Missing migration, unavailable credentials, skipped required tests or a flaky retry are not acceptance.
5. Browser reports, JSON results, screenshots and traces are retained for seven days.

The operations endpoint needs `CRON_SECRET` in the TEST Vercel project.
Configure an external scheduler to GET `/api/internal/operations` every minute with
`Authorization: Bearer <TEST CRON_SECRET>`. No new Vercel cron frequency is assumed.
The endpoint processes end-of-day cleanup, at most 20 SMS jobs within a time budget,
and deletes deduplication request records older than seven days.
Confirm worker timestamps advance in System → Operations. A heartbeat only proves a worker ran;
provider failures remain visible separately. Alerting and scheduler setup require the hosting account.

## Physical printer acceptance

The repository contains a prebuilt Print Bridge APK, but no Android source. This release changes
server job eligibility and web issuance; it does not rebuild or verify the APK's internal retry loop.
Paper already sent to hardware cannot be recalled. An Android bridge that holds a payload locally
must also revalidate cancellation before retrying; inspect its source if the device still retries.

In TEST with the real terminal:
- Disconnect printer, issue several stubs, cancel selected stubs, reconnect. Cancelled stubs must not print.
- Disconnect/restart bridge after claiming a job. It becomes uncertain after two minutes; check paper,
  then use Terminals → Reprint same stub. There must be one ticket number, not another customer entry.
- Exhaust five failed attempts, reconnect, and manually requeue the same active stub.
- Lose the kiosk connection after submission, reload, press again. Recover the original ticket.
- Verify the installed APK polls Print Bridge jobs. Older WebView-only wrappers that rely solely on
  immediate printStub need updated Android source before this server/web release is accepted.

## Operator support for 20 branches

Give each branch a named person to check connectivity, paper, printer pairing and device power.
They should report branch, terminal name, ticket number, time, and a screenshot of the failure.
Use Terminals for branch print failures and System → Operations for worker/SMS/device diagnostics.
Do not blindly requeue ambiguous SMS deliveries; check the provider's accepted-message history first.
Device last_seen shows server contact, not printer health.

Remaining rollout work: real 20-branch load tests, monitoring/alerts, backup restore rehearsal,
branch training, support hours/escalation, and government/private client data-retention/access policies.
Unit tests alone do not establish those operational guarantees. Calendar-day queue rollover/UI for
overnight businesses also needs a separate full-session acceptance test.

## Rollback

Revert the TEST app commit to the baseline if acceptance fails. Keep the additive migration;
its legacy two-argument issuance wrapper remains available. Do not drop request/job history
or reset counters to roll back. If an older Android wrapper requires the old immediate WebView
printing path, test that compatibility separately. Production remains a separate release decision.
