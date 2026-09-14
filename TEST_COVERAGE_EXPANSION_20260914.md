# QueueDrop test coverage expansion — 2026-09-14

## Build blocker fixed
- Root layout now wraps `GlobalSubmitLoading` in React `Suspense` so the component can safely use `useSearchParams()` during Next.js prerendering, including `/_not-found`.
- Added a rendering contract unit test to prevent this exact regression from returning.

## New unit coverage
Added `tests/unit/auth-landing.test.mjs` covering:
- environment allowlisted system owner landing
- database system owner landing
- safe internal `next` redirects
- external/protocol-relative redirect rejection
- staff vs manager/default authenticated landing

Added `tests/unit/rendering-contracts.test.mjs` covering:
- `GlobalSubmitLoading` is Suspense-wrapped in root layout
- global loader remains a client component when using navigation hooks
- root layout itself does not directly call `useSearchParams`

Unit suite count increases from 75 to 83 tests.

## Expanded E2E coverage without increasing scenario count
Existing lifecycle scenarios now additionally verify:
- inactive branch selection blocks Queue controls and shows the inactive-branch dialog
- custom roles can be deleted from Roles UI and disappear from persistence
- customer status mobile form renders country code and mobile number side-by-side with compact dial-code options

These checks are folded into the existing 47 regression scenarios so the suite remains readable while covering the new behavior.

## Areas already covered by existing automation
- branch/service lifecycle and persistence
- queue happy path, cancel, return-to-last, customer status + SMS
- terminal create/edit/kiosk/issue/remove
- reports and CSV export
- team member lifecycle
- settings navigation + branch isolation
- responsive phone/tablet/desktop layouts
- auth/public routes
- Supabase schema/RLS integration gates
- SMS provider/routing/runtime logic
- billing/subscription/tax logic
- queue position calculations
- terminal appearance validation
- secret scanning and production build gate

## Remaining areas better suited for future targeted tests
The following are not good candidates for simple isolated unit tests because they are UI/server-action/database integrations. They should be covered by targeted Playwright or integration tests as those flows stabilize:
- TV Display realtime reconnect/recovery under transient network loss
- global loading-overlay timing across every server-action redirect
- browser/kiosk print bridge behavior with real Android/Bluetooth hardware
- payment provider end-to-end checkout/webhook against a PayMongo test account
- actual SMS provider delivery against a provider sandbox/live test number

