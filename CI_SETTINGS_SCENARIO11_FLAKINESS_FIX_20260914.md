# CI Scenario 11 flakiness fix — 2026-09-14

GitHub Actions intermittently timed out `Scenario 11 - branch settings save and database persistence` at the suite-wide 45 second timeout. Playwright trace inspection showed that the queue-settings save, notifications save, result modals, and database persistence assertions all completed successfully; the test hit the global timeout during the final reload/navigation.

## Fix

- Split the shared settings/report setup into `setupBranch` and `setupReportWorkspace`.
- Scenario 11 now creates only the branch it actually needs instead of also creating, saving, and assigning an unrelated service. This removes roughly 15–20 seconds of hosted-CI setup work from the scenario.
- Scenario 12 still uses the full branch + service workspace because it needs the service for queue/report coverage.
- Added a timeout only to Scenario 11: 90 seconds in CI and 60 seconds locally. The global Playwright timeout remains unchanged, so unrelated tests do not get a broader timeout.

All existing assertions remain intact: both settings saves, success modals, direct database persistence checks, and final reload verification are still tested.

## Fixture cleanup

The branch-create helper previously raced two `page.waitForURL()` calls. The losing waiter stayed alive until its own 20-second timeout, which showed up in the trace as a background timeout even after branch creation succeeded. It now uses one URL predicate that accepts either success or the exact authorization error, then inspects the resulting URL. This preserves the one-time auth retry behavior without leaving a dangling Playwright navigation waiter.
