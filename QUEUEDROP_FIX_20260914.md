# QueueDrop E2E Fix - 2026-09-14

Fixes applied for the five failures from the 2026-09-13 full E2E run:

1. Service library deletion now removes linked operational branch services through the audited `delete_service_for_branch` RPC when there is no queue history, preventing orphaned active services.
2. Roles Settings remounts the role editor when the server action redirects with a newly selected `role` query parameter, so a newly created custom role opens in edit mode correctly.
3. Settings Scenario 11 now tests the current split Settings UI: Queue Settings for refresh interval and Notifications for SMS configuration.
4. Terminal Scenario 6 now follows the current PIN-save redirect to Settings > Terminals, then returns to the Terminals workspace for terminal lifecycle operations.
5. Queue Scenario 9 now has a realistic 90-second lifecycle timeout, verifies persisted waiting-order in the database, and reloads before the final UI-order assertion to avoid websocket timing flakiness.

Validation available in this environment:
- Modified `.mjs` Playwright files pass `node --check` syntax validation.
- Full npm lint/typecheck/E2E could not be rerun in the sandbox because the uploaded ZIP does not contain `node_modules` and dependency installation did not complete in the isolated runtime.
