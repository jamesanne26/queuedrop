# TEST → Production release inventory (2026-10-23)

Source: GitHub compare `main...test` at TEST commit `de0f71d5`.

## Scope
- 44 commits ahead, 0 behind; 25 changed files.
- Payment runtime: `app/api/payments/paymongo/webhook/route.ts`, `lib/billing/paymongo.ts`.
- Payment migrations: `20261022180000_atomic_paymongo_invoice.sql`, `20261022190000_atomic_paymongo_checkout.sql`, `20261023130000_paymongo_invoice_reference_uniqueness.sql`.
- Support migration: `20261023110000_reconcile_support_return_path.sql`.
- CI/test changes: workflows, PayMongo SQL assertions, E2E fixtures and unit tests.
- Dependencies: `package.json` and lockfile changed.

## Verified
- Six TEST GitHub workflows passed at `de0f71d5`.
- TEST Vercel deployment READY at matching SHA.
- Read-only TEST/PROD comparison: payment table constraints match.
- PROD has 3 PayMongo subscription orders (2 checkout_created, 1 failed); preserve all.
- PROD lacks two atomic PayMongo functions and two invoice unique indexes.
- Isolated application-schema backup/restore rehearsal passed; not a full managed Production DR test.

## Release blockers
1. Exercise concurrent checkout and invoice fulfillment in isolated sessions, asserting one payment and one subscription extension.
2. Validate PayMongo sandbox webhook signatures and retries end-to-end.
3. Produce a full Production backup and verified rollback plan, including managed Supabase dependencies.
4. Verify forward migration order against hosted Production migration history; resolve drift without rewriting existing migrations.
5. Complete real SMS delivery and PT-210 disconnect/reconnect acceptance.
6. Review runtime/dependency diff and owner E2E skips before promotion.

**Gate: NO-GO for Production deployment until blockers are verified. Do not deploy or mutate Production from this inventory.**
