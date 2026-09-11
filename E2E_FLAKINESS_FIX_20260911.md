# QueueDrop E2E flakiness hardening — 2026-09-11

This patch addresses the two retry-only scenarios observed in GitHub Browser E2E on commit `cb54c07`.

## Scenario 14 — Team member lifecycle

Root cause: the shared E2E helper used `page.getByRole("dialog")`. During a team-member update, the Edit details dialog can remain mounted while the global dashboard result modal appears. On a slower CI runner, the helper could bind to the underlying editor and wait for the success text in the wrong dialog.

Fix: `dismissDashboardResultModal()` now scopes to `.qd-result-modal-backdrop` and waits for that exact result dialog before checking the message and pressing OK.

## Scenario 7 — Queue happy path / History

Root cause: History is loaded through an asynchronous server action immediately after a completed-ticket refresh. The deployed CI path can be slower than local runs, and there was no visible request state or duplicate-request protection.

Fixes:

- Queue History has an explicit `historyLoading` state.
- The History button is disabled while loading and exposes `aria-busy`.
- Duplicate/stale history requests are ignored using a request id.
- History load errors are shown to the user instead of silently leaving the panel closed.
- Scenario 7 uses the stable History control and bounded 30s assertions for the server-action result and completed row, rather than a shorter timing assumption.

## Validation

The modified `.mjs` Playwright files pass `node --check` syntax validation in the artifact build environment. Full npm validation could not be completed inside the artifact container because package installation did not finish within the available network/runtime window. Run the normal QueueDrop gates locally before push:

```powershell
npm run lint
npm run typecheck
npm run test:unit
npm run test:sms
npm run security:secrets
npm run test:integration:required
npm run build
npm run test:e2e
```
## CI policy hardening

The Playwright CI configuration now treats flaky tests as failures. CI still
keeps one retry for diagnostics, but `failOnFlakyTests` prevents a retry-only
pass from showing a green Browser E2E workflow. `forbidOnly` also prevents an
accidental `test.only()` from silently reducing regression coverage. Retries
run in isolated mode to reduce interference from the rest of the suite.

Expected CI standard after this patch:

- 27/27 passed on the first attempt
- 0 failed
- 0 flaky
- no committed `test.only()`


## Scenario 6 terminal removal CI hardening

A later strict-CI run exposed a separate retry-only flake in Scenario 6. The terminal delete had already committed in Supabase, but Playwright sometimes timed out waiting for the server-action redirect query string on the hosted runner. The regression now synchronizes on the durable database deletion, then reloads the terminals page and verifies the terminal card is absent. This avoids treating transient Next.js RSC/navigation timing as product correctness while still validating both persistence and UI state.
