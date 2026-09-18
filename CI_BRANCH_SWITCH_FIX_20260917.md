# QueueDrop CI Branch-Switch Fix — 2026-09-17

## Failure investigated

- Suite: `tests/e2e/regression/owner-navigation.spec.mjs`
- Scenario: `switching Settings branches refreshes branch-specific General data`
- CI result before this fix: 47 passed, 1 flaky/failed after retry
- Symptom: clicking another branch left the browser at
  `/dashboard/settings?view=branch-general` instead of adding the selected
  `branch` query parameter.

## Root cause

The Playwright trace showed that pointer hover started a manual
`router.prefetch()` request for the branch URL immediately before the click.
The corresponding `router.replace()` navigation was then not committed. This
made fast hover-to-click branch selection unreliable and caused the CI flake.

## Changes

- Removed manual pointer/focus prefetching from dynamic branch buttons.
- Added `aria-current="page"` to the selected branch.
- Updated the regression test to select a known non-active branch rather than
  assuming the second alphabetically sorted branch is always different.
- Added rendering-contract assertions that preserve these behaviors.

## Validation

- ESLint: pass
- TypeScript: pass
- Unit tests: 101/101 pass
- SMS tests: 17/17 pass
- Required integration tests: 5/5 pass
- Secret scan: pass
- Production build: pass
- Playwright test collection/syntax: pass

The changed live-browser scenario must run against the newly deployed commit;
the supplied Playwright browser binary is not bundled with the source archive.
