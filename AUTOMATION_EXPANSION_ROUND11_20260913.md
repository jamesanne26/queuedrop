# QueueDrop automation expansion — 2026-09-13

This round adds automated checks at the lowest useful layer instead of trying to drive every pure business rule through Playwright.

## New unit coverage
- Role branch-scope fallback and single-vs-multi-branch assignment invariants.
- SMS dry-run/failure-injection safety flags and retry backoff.
- Generic SMS provider credential naming, field validation, HTTPS/private-network protection, request body/auth construction, and response-path parsing.
- SMS routing method validation, fallback de-duplication, provider-family policies, cheapest-provider ordering, and no-silent-fallback behavior.

## New browser regression coverage
- Compact desktop sidebar width.
- Equal dimensions for `Save Role & Permissions` and `Create Custom Role`.
- Equal dimensions and bounded spacing for branch `Save Changes` and `Delete branch`.

## Runner updates
- `npm run test:fast`
- `npm run test:settings`
- `npm run test:ui:consistency`
- Existing `npm run test:all` remains the full authoritative gate and includes the new Playwright spec via `test:e2e`.
