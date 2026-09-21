# QueueDrop Browser E2E

This suite uses Playwright and exercises QueueDrop through a real Chromium browser.

## Coverage in this patch

- Public homepage/login/pricing rendering and protected dashboard redirect.
- Owner login, sign out, health endpoint, and owner navigation through all main dashboard destinations.
- Scenario 1: create/delete a unique branch and verify TEST Supabase persistence.
- Scenario 2: create a unique branch + service and verify TEST Supabase persistence.
- Scenario 3: branch lifecycle — create, edit, inactive/active status transitions, delete, and DB verification.
- Scenario 4: service lifecycle — create, edit, deactivate/reactivate, delete, and DB verification.
- Scenario 5: invalid short branch-name validation; verifies the browser blocks submission and no branch row is created.
- Scenario 6: terminal lifecycle — PIN configuration, create, reassign default service, open kiosk, issue a real stub, protected exit, and remove.
- Scenario 7: full happy-path queue workflow — waiting → pending/called → serving → completed → history.
- Scenario 8: waiting-stub cancellation with verification code.
- Scenario 9: return a serving stub to the end of the waiting queue.
- Scenario 10: customer status page and SMS number persistence.
- Scenario 11: branch settings save/reload with DB verification.
- Scenario 12: completed queue record in filtered Reports plus authenticated CSV export.
- Scenario 13: custom role create/update with branch-scope persistence.
- Scenario 14: team member create, update, deactivate/reactivate, and permanent delete.
- Scenario-owned branches, services, terminals, tickets, roles, and auth users use unique data and scoped cleanup so tests remain independent.
- Screenshot, trace, and video are retained on browser failure.

## Required environment variables

For authenticated navigation:

- `E2E_OWNER_EMAIL`
- `E2E_OWNER_PASSWORD`

For database-backed independent scenarios:

- `QUEUEDROP_TEST_SUPABASE_URL`
- `QUEUEDROP_TEST_SUPABASE_SERVICE_ROLE_KEY`

For deployed-site GitHub Actions:

- `QUEUEDROP_TEST_BASE_URL`

Use TEST-only accounts/projects. Never point the mutation suite at production.

## Commands

First-time setup:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-browser-e2e.ps1
```

Local browser suite against the local Next.js dev server. Playwright automatically loads `.env.test.local` first, then `.env.local`; existing shell/CI variables always win. Placeholder TEST deployment URLs are ignored locally:

```powershell
npm run test:e2e
```

Against a deployed TEST URL:

```powershell
$env:QUEUEDROP_TEST_BASE_URL="https://your-test-url.example"
npm run test:e2e
```

Interactive debugging:

```powershell
npm run test:e2e:ui
```

## Expansion rule

Keep every regression scenario independent. New scenarios must add their own fixtures and cleanup instead of changing working scenario data contracts. Role/permission boundary matrices and provider-specific SMS delivery can be expanded further when dedicated non-owner test accounts/gateways are configured.

## Local server stability

Local `npm run test:e2e` now runs against a production-like Next.js server by default (`next build` + `next start`). This deliberately avoids development HMR/RSC abort noise such as `The destination stream closed early` and gives local regression runs behavior closer to a deployment.

For intentional local HMR debugging only, set `QUEUEDROP_E2E_SERVER_MODE=dev` before running Playwright. The normal regression command should keep the production-like default.

The public/auth regression group also validates `/api/health` and fails on uncaught browser `pageerror` events, so a green run means more than an HTTP status check.

## CI flake hardening (2026-09-11)

Two timing-sensitive paths were hardened after GitHub-hosted runs exposed retry-only passes:

- Dashboard result assertions now target the dedicated result modal instead of the first generic `role="dialog"`. This prevents an already-open editor modal (such as Team member Edit details) from being mistaken for the server-action success modal.
- Queue History now exposes an explicit loading state, prevents duplicate history requests, handles load failures visibly, and the Scenario 7 assertion allows the deployed server action enough time to return before validating the completed ticket row.

Do not solve future flakes with arbitrary sleeps. Prefer a stable UI state, a specific accessible locator, a database/API state transition, or a bounded application-level loading state.
