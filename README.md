# QueueDrop

QueueDrop is a multi-tenant web-based queue management SaaS built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Environment model

- DEV: local Next.js + local Supabase via Docker
- TEST: cloud Supabase / cloud web deployment
- PROD: isolated production cloud environment

## Current development milestone

Milestone 2 adds secure owner business onboarding on top of the authentication foundation:

1. User signs up / signs in.
2. Authenticated user creates the initial business workspace.
3. One atomic PostgreSQL RPC creates the business, owner membership, first branch, branch membership, queue defaults, and audit record.
4. The dashboard reads the new workspace through the existing RLS policies.

## Local development

```bash
npm install
npx supabase start
npx supabase migration up --local
npm run dev
```

Local environment values belong in `.env.local` and must never be committed.

### Milestone 3
Branch and service management is available in local DEV under `/dashboard/branches` and `/dashboard/services`. New branches are created transactionally with their queue defaults, and services support branch-specific prefixes, ETA values, and active/inactive state.

## Milestone 4 — Public Queue Engine

QueueDrop now contains the first usable queue loop in local DEV. Business owners can create branches and services, open `/dashboard/queues`, and launch a public customer join page. Customers can select a service, enter a name and international mobile number, receive a service-prefixed queue number, and keep a private status URL that refreshes their current position.

Database migration: `supabase/migrations/20260822134000_public_queue_engine.sql`.

The next milestone adds authenticated staff queue actions and the queue state machine (call, serve, complete, no-show, cancel), plus stronger operational controls.

### Milestone 5

Staff queue operations are now available from `/dashboard/queues`: call next by service, recall a called customer, start serving, complete, mark no-show, or cancel. Queue state transitions are validated inside PostgreSQL and recorded in ticket events/audit logs.

### Branch-scoped access
Owner/Admin accounts can view and operate all branches in their business. Manager/Staff accounts are limited to branches explicitly assigned through `branch_users`; queue operations enforce the same rule in PostgreSQL.

### Milestone 6: Team management

Business owners/admins can manage team members at `/dashboard/team`. Admins have business-wide access; managers and staff are explicitly assigned to one or more branches. QueueDrop enforces inactive membership and branch scope in PostgreSQL helper functions as well as in the application UI.
