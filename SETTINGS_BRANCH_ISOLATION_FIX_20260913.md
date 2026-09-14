# Settings branch isolation fix — 2026-09-13

This update fixes branch switching and prevents branch-specific settings from leaking across branches.

## Included
- Branch selection now shows a loading state instead of stale settings while the server refreshes.
- The Settings workspace remounts when the selected branch changes so General and all sibling branch tabs render the newly selected branch data.
- Terminal Appearance can only save to the selected branch; the old "apply to all branches" path was removed from both UI and server action.
- Terminal exit PINs are branch-specific through migration `20260913194500_branch_settings_isolation.sql`.
- Existing business kiosk PINs are copied to current branches once during migration to preserve current behavior, then each branch can be changed independently.
- Delete branch, delete service, remove service assignment, and remove terminal actions now ask for confirmation.
- Queue cancel verification closes immediately after the valid Cancel Stub submission and optimistically removes the cancelled stub while realtime reconciles.
- Added a Playwright regression check that switches between two Settings branches and verifies General form branch id/name update.

## Database
Run `npx supabase db push` once before testing branch-specific terminal PIN behavior.
