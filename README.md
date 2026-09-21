# QueueDrop

QueueDrop is a multi-tenant queue management SaaS for service businesses. It supports branch/service queues, stub-first terminals, customer status pages, staff queue operations, role/branch access, notifications, reports, subscriptions, and terminal branding.

## Stack

- Next.js 16 + React 19 + TypeScript
- Supabase Auth, PostgreSQL, RLS, RPC, Realtime and Storage
- Cloud deployment for TEST/PROD; local Next.js + Supabase for DEV

## Repository map

```text
app/                 Next.js routes, server actions and UI
lib/                 reusable domain/application helpers and Supabase clients
supabase/migrations/ ordered database changes; source of truth for schema evolution
supabase/seed.sql     local/test seed support
tests/unit/           fast deterministic business-logic tests
tests/integration/    TEST Supabase/schema and service integration checks
tests/e2e/            browser smoke/regression structure
tests/visual/         responsive/screenshot regression structure
docs/                 architecture, development, testing and deployment docs
.github/workflows/    automated quality and scheduled deployment checks
```

## Local development

1. Copy `.env.example` to `.env.local` and fill only your local/DEV values.
2. Install dependencies: `npm ci` (or `npm install` when intentionally updating the lockfile).
3. Start local Supabase when working against DEV: `npx supabase start`.
4. Apply local migrations: `npx supabase migration up --local`.
5. Run the app: `npm run dev`.

Never commit `.env.local`, service-role keys, passwords, device tokens or production data.

## Quality commands

```bash
npm run test:unit          # fast unit suite
npm run test:unit:coverage # unit suite + Node coverage
npm run test:integration   # integration checks; skips cloud checks if TEST secrets are absent
npm run test:smoke         # deployment smoke checks when QUEUEDROP_TEST_BASE_URL is set
npm run quality            # lint + typecheck + unit tests
npm run verify             # quality + integration + production build
```

Run `npm run test:unit:watch` while changing pure business logic. Run `npm run verify` before a release candidate.

## Branch and release flow

```text
feature/* or fix/*
        ↓ Pull Request
lint + typecheck + unit + build
        ↓ reviewed merge
       test
        ↓ deploy TEST
integration + smoke + browser regression
        ↓ approval
       main / production
```

Direct pushes to production should be treated as emergency-only. Database migrations must be reviewed and applied to TEST before PROD.

## Documentation

Start with `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, `docs/TESTING.md`, and `docs/DEPLOYMENT.md`. Security/access rules are summarized in `docs/AUTHORIZATION.md`. Important architectural decisions are recorded under `docs/adr/`.

## Automated test environment

Unit tests run without infrastructure credentials. Integration/smoke runners automatically load local env files and only use explicit TEST-prefixed infrastructure variables. See `docs/TEST_ENVIRONMENT.md`. Use `npm run test:integration:required` for CI/release gates where skipped integration checks are not acceptable.
