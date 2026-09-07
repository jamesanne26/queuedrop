# QueueDrop architecture

## System shape

```text
Customer browser / Stub terminal / Staff dashboard
                    │
                 Next.js
        ┌───────────┼────────────┐
        │           │            │
 Server actions   API routes   Server components
        └───────────┼────────────┘
                    │
                 Supabase
      ┌─────────────┼──────────────┐
     Auth        PostgreSQL      Storage
                  │   │             │
                 RLS RPC         terminal-assets
                  │
               Realtime
```

## Boundaries

- `app/` owns routing, request orchestration and presentation.
- `lib/` owns reusable rules that can be tested without a browser/database when possible.
- PostgreSQL RPC/RLS owns critical queue transitions, tenant boundaries and database invariants.
- `supabase/migrations/` is the ordered history of database changes.
- External providers (SMS, payments, print bridge) must not make core queue state transitions fail when they are non-critical side effects.

## Multi-tenancy

`businesses` is the tenant boundary. Branches/services/tickets are scoped under a business through direct or branch relationships. `business_users` establishes tenant membership; `branch_users` narrows branch access for scoped roles. New code must assume hostile cross-tenant identifiers and validate access server/database-side.

## Queue model

Queues are service-aware. Waiting positions are calculated independently per service. Operational state changes use database functions/RPC where atomicity or authorization is important. Browser realtime is an optimization; reconciliation exists so the UI can self-heal after missed events.

## Engineering rule

When a piece of logic can be pure, place it in `lib/` and unit test it. When the invariant depends on persisted state, enforce it in PostgreSQL/RPC/RLS and cover it with integration/E2E tests.
