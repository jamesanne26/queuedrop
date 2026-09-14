# QueueDrop Round 11 gate fix — 2026-09-13

This patch fixes the failures found by the expanded automation run.

- Removed the synchronous state-reset effect from the unified Settings client console. Server route changes now remount the console with an authoritative key, eliminating the React hooks lint failure while preserving branch/access expansion for the active route.
- Removed the stale generated `settings-unified-console.jsx` duplicate so lint and runtime cannot drift from the TSX source.
- Updated branch/service/role/team E2E flows to use the unified `/dashboard/settings` workspace instead of legacy `/dashboard/branches`, `/dashboard/services`, and `/dashboard/team` expectations.
- Updated service test setup for the business-wide Service Library + branch assignment model.
- Updated responsive owner-route coverage to test the current Settings views rather than legacy management pages.
- Fixed phone Settings tabs by wrapping branch tabs on narrow viewports so controls no longer extend beyond the viewport.
- Removed the six lint warnings reported in the failing run where practical (unused branch settings variable, dead service helper, unused Settings profile variable, unused Team create props).
- Expanded `test:settings` to include current branch and service lifecycle coverage.

No database migration is added by this patch.
