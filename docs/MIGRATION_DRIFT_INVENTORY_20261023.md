# Migration drift inventory — read-only audit (2026-10-23)

Comparison: repository `test` (108 numbered migration files), hosted TEST and hosted Production `supabase_migrations.schema_migrations`. Counts represent migration IDs, **not proven schema differences**.

| Environment | Hosted IDs | Hosted-only IDs | Repo-only IDs |
|---|---:|---:|---:|
| TEST | 112 | 12 | 8 |
| Production | 104 | 11 | 15 |

## TEST hosted-only
`20261011082518`, `20261011082655`, `20261011082819`, `20261011172139`, `20261011180315`, `20261022044710`, `20261022052159`, `20261022052205`, `20261022052950`, `20261022053759`, `20261022074746`, `20261023031649`.

## TEST repo-only
`20261010193000`, `20261011101500`, `20261011101600`, `20261011171100`, `20261022180000`, `20261022190000`, `20261023110000`, `20261023130000`.

## Production hosted-only
`20261006113645`, `20261006113655`, `20261006113854`, `20261007045514`, `20261007141036`, `20261011082614`, `20261011082707`, `20261011082852`, `20261011172148`, `20261011172156`, `20261011172410`.

## Production repo-only
`20261006055057`, `20261006064151`, `20261006064855`, `20261006070929`, `20261006204652`, `20261007140745`, `20261010193000`, `20261011101500`, `20261011101600`, `20261011124748`, `20261011171100`, `20261022180000`, `20261022190000`, `20261023110000`, `20261023130000`.

## Safe next steps
1. Extract read-only schema definitions for changed objects from both hosted environments and repository migrations; compare semantics, not just timestamps.
2. Identify historical migrations already applied under different IDs; do not replay duplicate DDL.
3. Rehearse a forward-only reconciliation on a disposable restore, retaining all existing Production orders, subscriptions and payments.
4. Prepare an approved migration ledger repair plan only after equivalence is demonstrated.

**No hosted migrations were executed or modified in this audit. Production remains NO-GO.**
