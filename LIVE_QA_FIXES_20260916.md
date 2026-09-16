# QueueDrop Live QA Fixes — 2026-09-16

This package addresses the actionable findings from the fresh live QA audit.

## Fixes

- Queue race: `Call next` is disabled while `Get test stub` is still creating a stub, preventing a stale `No waiting stub for this service` result.
- Users and Roles: Settings no longer swaps to a view backed by unloaded placeholder arrays. The existing panel remains until the server-loaded route is ready, with one loading overlay.
- Appearance preview: the preview now shows the selected branch and its first assigned service instead of hard-coded `Commonwealth` / `Haircut` labels.
- Role performance: removed an unrelated team-page cache revalidation after role creation and synchronized assigned users in parallel during role updates.
- Regression coverage: added unit contracts and targeted E2E assertions for Users/Roles navigation, the queue-history error URL, the stub/call-next race, and appearance preview scope.

## Validation

- Lint: PASS
- TypeScript: PASS
- Unit: 101/101 PASS
- SMS: 17/17 PASS
- Secrets scan: PASS
- Integration: 5/5 PASS
- Production build: PASS
- Targeted E2E execution: blocked before test logic because the runtime does not contain the Playwright Chromium binary. Both affected specs pass JavaScript syntax validation and are included for the next machine/CI run.

## Deployment notes

- No database migration was added.
- Replace the project, preserve the environment files as usual, then run `npm install` and `npm run test:e2e` before commit/push.
