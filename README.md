# QueueDrop

QueueDrop is a multi-tenant, web-based queue management SaaS for service businesses. Customers use a browser—no app download required.

## Environment model

- **DEV:** local Next.js + Docker + local Supabase
- **TEST:** cloud Supabase project (`QueueDrop Test`) + staging web deployment
- **PROD:** separate cloud Supabase project + production web deployment

## Local setup

1. Install Node.js, Docker Desktop, and Supabase CLI support.
2. Copy `.env.example` to `.env.local` and enter **local** Supabase values from `npx supabase status`.
3. Start Docker Desktop.
4. Run `npx supabase start`.
5. Run `npm install`.
6. Run `npm run dev`.
7. Open `http://localhost:3000`.

## Database

Database changes live under `supabase/migrations/`. The local DEV database can be rebuilt with:

```bash
npx supabase db reset
```

Never point local development credentials at PROD. Promote tested migrations through TEST before PROD.

## Current application milestone

- Responsive QueueDrop marketing page
- Supabase SSR browser/server clients
- Next.js Proxy session refresh
- Email/password sign-in and sign-up foundation
- Auth callback route
- Protected dashboard shell
- Existing QueueDrop schema/RLS/migrations preserved

The secure business onboarding transaction, queue operations, kiosk/customer public join flow, reporting, subscriptions, and system-admin functions are the next implementation milestones.
