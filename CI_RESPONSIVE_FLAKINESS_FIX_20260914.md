# CI Responsive Flakiness Fix — 2026-09-14

## Problem
GitHub Actions completed 46/47 browser E2E scenarios, but `responsive layout coverage › owner views fit tablet (820x1180)` was classified as flaky because the whole authenticated owner route sweep exceeded the global 45-second Playwright test timeout on the slower hosted runner.

The captured failure snapshot showed the final Billing & Subscription settings page rendered correctly; there was no responsive assertion failure. The failure was the aggregate test timeout.

## Fix
Updated `tests/e2e/regression/responsive-layout.spec.mjs` only:
- CI public sweep budget: 60 seconds.
- CI authenticated owner sweep budget: 120 seconds.
- Local owner sweep budget: 60 seconds.
- Added `test.step(...)` per route so future CI failures identify the exact route.
- Added HTTP response assertions to authenticated owner routes, matching the public sweep behavior.
- Kept every existing responsive assertion and page-error assertion intact.

This is intentionally scoped to the multi-page responsive sweep. The global Playwright timeout stays at 45 seconds, so ordinary scenarios do not become less strict.

## Validation
- `node --check tests/e2e/regression/responsive-layout.spec.mjs` passed.
- Full browser execution must be run in the configured QueueDrop environment because the supplied source archive does not include `node_modules` and CI credentials are external.
