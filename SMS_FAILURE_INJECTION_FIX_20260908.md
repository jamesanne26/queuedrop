# SMS failure-injection safety fix — 2026-09-08

## Root cause
`SMS_FORCE_FAILURE=true` could be inherited by the Next.js process from the parent PowerShell/session/machine environment. Next.js does not overwrite an already-existing process environment variable with `.env.local`, so setting `SMS_FORCE_FAILURE=false` in the file was not sufficient in that case.

## Fix
Intentional SMS provider failure now requires **all three** flags:

- `SMS_DRY_RUN=true`
- `SMS_ENABLE_FAILURE_INJECTION=true`
- `SMS_FORCE_FAILURE=true`

A stale/inherited `SMS_FORCE_FAILURE=true` by itself can no longer break dry-run SMS delivery.

Normal dry-run testing only needs `SMS_DRY_RUN=true`.
