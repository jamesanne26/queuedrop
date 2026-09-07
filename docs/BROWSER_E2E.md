# QueueDrop Browser E2E

This suite uses Playwright and exercises QueueDrop through a real Chromium browser.

## Coverage in this patch

- Public homepage/login/pricing rendering.
- Protected dashboard redirect when signed out.
- Owner login and sign out.
- Owner navigation through Overview, Branches, Services, Team, History & Reports, Terminals, Queues, and Settings.
- Scenario 1: create/delete a unique branch through the UI and verify persistence through TEST Supabase.
- Scenario 2: create a unique branch and service through the UI and verify persisted state.
- Scenario-owned data is unique and cleanup is scoped to the branch created by that scenario.
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

## Expansion plan

Keep each regression scenario independent. The next scenarios should cover Team/Roles, Terminals, Get Stub, Live Queue operations, customer status recovery, Settings, Reports/export, SMS routing, and role/permission boundaries. Add them one scenario at a time without modifying working scenario data contracts.

## Local server stability

Local `npm run test:e2e` now runs against a production-like Next.js server by default (`next build` + `next start`). This deliberately avoids development HMR/RSC abort noise such as `The destination stream closed early` and gives local regression runs behavior closer to a deployment.

For intentional local HMR debugging only, set `QUEUEDROP_E2E_SERVER_MODE=dev` before running Playwright. The normal regression command should keep the production-like default.

The public/auth regression group also validates `/api/health` and fails on uncaught browser `pageerror` events, so a green run means more than an HTTP status check.
