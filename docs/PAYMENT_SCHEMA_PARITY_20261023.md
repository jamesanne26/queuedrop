# Payment schema parity audit — 2026-10-23

Read-only comparison of hosted TEST (`tcgiwtfhqssulxwawimh`) and hosted Production (`sylvegfbkxgjfctbjfec`) for `public.payments`, `public.subscription_orders`, and `public.business_subscriptions`.

| Schema element | TEST | Production | Difference |
|---|---:|---:|---|
| Columns | 69 | 69 | No column, type or nullability differences |
| Table constraints | 22 | 22 | No name or definition differences |
| Indexes | 15 | 13 | Two PayMongo invoice unique indexes absent in Production |
| Atomic checkout RPC | Present | Absent | Must deploy compatible migration |
| Atomic invoice RPC | Present | Absent | Must deploy compatible migration |

## Exact missing Production indexes

- `public.payments_paymongo_invoice_unique_all` — defined by `20261022180000_atomic_paymongo_invoice.sql`.
- `public.payments_paymongo_invoice_reference_unique` — defined by `20261023130000_paymongo_invoice_reference_uniqueness.sql`.

The checkout RPC is defined by `20261022190000_atomic_paymongo_checkout.sql`; invoice RPC by `20261022180000_atomic_paymongo_invoice.sql`.

Production read-only preflight observed zero payments, zero duplicate payment IDs, zero duplicate subscription invoices and zero duplicate invoice references. Three existing subscription orders and two business subscriptions must be preserved.

**This is a targeted comparison, not full schema parity.** Hosted migration ledger IDs differ from repository migrations; see `docs/MIGRATION_DRIFT_INVENTORY_20261023.md`. Do not blindly push all repository migrations to Production.

## Release gates

1. Compare migration SQL against full Production schema and verify historical equivalence of divergent migration IDs.
2. Restore an appropriate Production backup to disposable infrastructure; rehearse migration sequence and verify pre-existing records survive.
3. Apply approved migration plan to Production before deploying dependent webhook code.
4. Verify RPC execute privileges, both unique indexes, and payment preflight; then validate real sandbox webhooks and hardware/SMS acceptance.

No Production writes or deployments were made by this audit.
