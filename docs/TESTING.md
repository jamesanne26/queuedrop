# Testing strategy

QueueDrop uses layers so fast tests catch most regressions early while browser/database suites validate real integration.

## Layers

### Unit
`tests/unit/` contains deterministic business-rule tests. No real network/database. Run continuously while coding and on every PR.

Current foundation covers dashboard access calculation, queue position calculation, terminal appearance validation/path safety, and SMS recipient normalization.

### Integration
`tests/integration/` validates TEST Supabase schema/RPC contracts. These tests intentionally skip cloud checks when isolated TEST credentials are not configured. Never point them at production.

### Deployment smoke
`tests/e2e/smoke/` verifies the deployed TEST instance is alive, the homepage/login/pricing routes return real HTML with HTTP 200, the health payload is valid, and unauthenticated dashboard access redirects to login. Requests use a timeout so a hung deployment fails clearly. This suite should run after every TEST deployment.

### Browser regression
The long-term Playwright suite belongs in `tests/e2e/regression/`. Existing external QueueDrop automation should be migrated incrementally rather than discarded. Every scenario must own its data through a unique run id and must not depend on another scenario.

### Visual/responsive
`tests/visual/` is for screenshot/viewport regression. Prioritize Queue View and terminal/customer screens on phone/tablet portrait because those are operationally important layouts.

## When to run

| Trigger | Required checks |
| --- | --- |
| While coding | targeted unit watch |
| Before commit | unit + lint/typecheck as relevant |
| Pull request | lint + typecheck + unit + build |
| DB/RPC/RLS change | integration + targeted E2E |
| TEST deployment | deployment smoke + targeted browser E2E |
| Before production | full regression + critical visual checks |
| Nightly | full regression/health checks where TEST credentials exist |

## Test data rules

Use only DEV/TEST. Generate a unique run id such as `QD-E2E-20260907-a91f`; prefix scenario-owned entities with it; cleanup only rows created by that run. Never use `delete all clients` as a generic cleanup strategy.

## Regression rule

Every production-impacting bug should leave behind an automated test at the lowest layer that can reproduce it. Example: terminal image uploads over 1 MB should remain direct-to-storage rather than binary Server Action submissions.

## Skips versus release gates

Local integration/smoke commands may skip infrastructure checks when TEST configuration is absent. Release automation must use the `:required` commands so missing credentials become a failure rather than a false-green pass. The runner auto-loads `.env.test.local` / `.env.local`; explicit `QUEUEDROP_TEST_*` variables are required for Supabase integration tests to avoid accidental production access.

## 2026-09-13 expanded automated coverage

The unit suite now also covers role/branch-scope invariants, SMS failure-injection safety, generic SMS provider request construction/SSRF guards, and SMS route selection/order. These are deterministic business rules and belong at unit level rather than being repeated through slow browser tests.

Focused browser commands:

- `npm run test:settings` — Settings navigation, branch persistence, roles/team flows, reports settings flow, and UI consistency contracts.
- `npm run test:ui:consistency` — desktop sizing/alignment contracts plus responsive coverage.
- `npm run test:fast` — lint, typecheck, unit, SMS, and secret scan for a fast pre-commit gate.
- `npm run test:all` — authoritative full release gate; it still runs every Playwright regression, so focused specs are not duplicated in the full runner.

New UI contract regressions explicitly protect the compact desktop sidebar, equal-sized Role toolbar actions, and the grouped/equal-sized Save/Delete branch actions. Keep these checks when changing dashboard CSS so visual regressions are caught automatically.
