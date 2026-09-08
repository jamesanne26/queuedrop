# QueueDrop E2E Failure Fix — 2026-09-08

## What failed

The full local verification passed lint/typecheck/unit/SMS/secret-scan/integration/build, then Playwright finished with 26/27 passing. The only final E2E failure was Scenario 8 (cancel a waiting stub with verification code). Playwright located the correct enabled `Cancel stub` button, but the live queue's periodic Supabase reconciliation could replace the DOM node while Playwright was performing pointer-stability checks, producing `element was detached from the DOM` until the 12-second action timeout.

## Fix

- Added `submitVerificationDialog()` to the terminal/queue E2E spec.
- The helper still verifies the displayed 4-digit code, fills the visible confirmation input, verifies the submit button is enabled, then submits the actual confirmation form with the browser's `requestSubmit()` API.
- This uses the same form/server-action submission path without relying on a pointer target staying mounted during live-queue reconciliation.
- Scenario 8 now uses the helper.
- Scenario 9 uses the same helper proactively because it has the same verification dialog and could suffer the same race.
- Removed the unused `id` variable in Scenario 5, clearing the ESLint warning from the supplied run.

## Validation in artifact workspace

- Modified E2E files pass `node --check` syntax validation.
- A full dependency install could not be completed in the artifact sandbox before packaging, so the full Playwright suite must be rerun in the user's existing QueueDrop workspace where dependencies and TEST secrets are already configured.
