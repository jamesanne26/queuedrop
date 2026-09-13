# QueueDrop Settings Hierarchy + TV Queue Display — 2026-09-13

## Navigation
Main dashboard navigation is intentionally limited to daily operations:
- Overview
- Queues
- History & Reports
- TV Queue Display
- Settings

Branches, Services, Users & Access, and Terminals remain fully functional but are reached through Settings instead of occupying the main sidebar.

## Settings hierarchy
Settings now separates business-wide configuration from branch-specific configuration.

Business-wide:
- Branches
- Services (master list)
- Users & Access
- Business
- Billing & Subscription

Selected branch:
- General
- Services
- Branch Users
- Operating Hours
- Queue Settings
- Notifications
- Appearance
- Terminals

## Users & Access
The users page follows the supplied draft direction:
- Desktop/tablet table view
- Name and email
- Default role selector
- Permission snapshot columns
- Gear action for edit details
- Password change
- Branch assignment
- Active/inactive access
- Delete user
- Responsive card layout on smaller screens

## Branch terminal appearance
A new migration adds branch-level terminal appearance overrides. Each branch may have a different theme. The editor also includes "Apply this appearance to all branches". Applying to all updates business defaults too, so future branches inherit that appearance.

Migration:
`supabase/migrations/20260913113000_branch_terminal_appearance.sql`

## TV Queue Display
New route:
`/dashboard/tv`

The screen deliberately contains only two high-visibility columns:
`WAITING | SERVING`

Waiting tickets appear under WAITING. Called/serving tickets appear under SERVING. The display receives ticket realtime updates and uses a low-frequency refresh only as a recovery fallback.

## Cleanup
Generated build/test artifacts are intentionally excluded from the delivery ZIP. Existing legacy admin routes are retained internally for backward compatibility and test stability; they are no longer exposed in the primary sidebar.

## Validation performed in the sandbox
Passed:
- TypeScript/TSX syntax transpilation for all modified TypeScript files
- `node --check` for modified E2E specs
- Unit tests: 56/56
- SMS tests: 17/17
- Secret scan

Full integration/build/E2E could not be completed in the sandbox because dependency installation was incomplete in the isolated environment. Run the full gate locally after `npm install` and the database migration.
