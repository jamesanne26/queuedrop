# QueueDrop Update Notes

## Milestone 2 — Business onboarding foundation

This package builds on the tested Milestone 1 authentication foundation.

### Added
- Secure `create_initial_business_workspace(...)` PostgreSQL RPC migration.
- Atomic creation of the first business, owner membership, first branch, branch membership, default queue configuration, and audit log.
- Authenticated onboarding page at `/onboarding`.
- Server-side onboarding validation and error handling.
- Dashboard workspace summary after onboarding.
- First branch display and onboarding success state.

### Security design
- The onboarding transaction is `SECURITY DEFINER` because normal RLS correctly prevents a user from inserting a business before membership exists.
- The function obtains the acting user from `auth.uid()` and does not accept a user ID from the browser.
- `anon` and `PUBLIC` cannot execute the onboarding function; only `authenticated` receives `EXECUTE`.
- A per-user transaction advisory lock prevents double-submit races from creating duplicate initial workspaces.
- All related records are created in one database transaction. Any failure rolls back the whole onboarding operation.

### Apply locally
After copying this package over the existing project, keep the existing `.env.local` and `.git` directory. With Docker Desktop and local Supabase running, apply the new local migration before testing Milestone 2.

Do not push this migration to TEST until local onboarding has been verified.

## Milestone 3 — Branch & Service Management

Added:
- Reusable dashboard navigation.
- `/dashboard/branches` for listing and creating branches.
- Automatic default queue configuration + creator branch membership for every new branch.
- `/dashboard/services` for creating branch-specific services.
- Service queue prefix, estimated duration, active/inactive controls.
- Audit-log entries for branch/service management actions.
- Server-side auth hardening via `auth.getUser()` for sensitive flows.
- Migration `20260822130000_branch_service_management.sql`.

Local verification sequence:
1. Copy/replace package source files into the existing repo (keep `.git` and `.env.local`).
2. Run `npx supabase db reset` (LOCAL DEV only).
3. Create a fresh local DEV account after reset.
4. Create a business workspace.
5. Create a second branch at `/dashboard/branches`.
6. Create services at `/dashboard/services` and test deactivate/activate.
7. Run `npm run build`.

### Milestone 3 hotfix
- Auth proxy now verifies the user with Supabase Auth (`getUser`) so stale local cookies after `supabase db reset` cannot cause an auth redirect loop.

## Milestone 4 — Public Queue Engine

Added the first end-to-end customer queue flow:

- Public branch join route: `/q/[businessSlug]/[branchSlug]`
- Public service selection and customer name/mobile capture
- International-format mobile validation using country code (E.164-style)
- Atomic queue-session creation and per-service ticket numbering
- Service-specific prefixes (for example `HC001`, `HS001`)
- Duplicate active-ticket protection per service/mobile number
- Private 24-hour customer ticket links using `customer_sessions.session_token`
- Live ticket status page with automatic refresh
- Queue position calculation per service
- Dashboard `/dashboard/queues` view for branch members
- Branch timezone foundation (default `Asia/Manila`)
- Configurable branch-contact visibility field
- `service_queue_counters` for concurrency-safe per-service numbering
- Additional ticket indexes for queue reads

This milestone intentionally does **not** yet add staff actions (call / serve / complete / no-show). Those are the next queue-operations layer.

## Milestone 5 — Staff Queue Operations

- Added secure staff queue RPCs with server-side permission checks.
- Added per-service **Call next** workflow.
- Added **Start serving**, **Recall**, **Complete**, **No-show**, and **Cancel** actions.
- Enforced safe ticket state transitions in PostgreSQL rather than trusting the browser.
- Added ticket events and business audit logs for staff queue actions.
- Customer queue position automatically changes because called/serving/completed tickets leave the waiting-position calculation.
- Added active queue and recent-history sections to the staff queue dashboard.

## Milestone 5 branch-isolation hotfix
- Owner/Admin: business-wide branch visibility and queue operation.
- Manager/Staff: only branches explicitly assigned through `branch_users`.
- Branch, service, queue, and queue-config reads are branch-scoped for non-admin users.
- Queue RPC authorization no longer gives managers implicit access to every branch in the business.
- Includes the 10-client local DEV seed dataset.

## Milestone 6 — Team & Staff Management

- Added `/dashboard/team` for business owners/admins.
- Owners/admins can create Auth accounts for admins, managers, and staff.
- Managers/staff require explicit branch assignments.
- Team access can be activated/deactivated without deleting the Auth account.
- Inactive memberships no longer grant business, branch, service, or queue access.
- Added profile email synchronization for team lists.
- Team member changes are audited through `team.member_added` / `team.member_updated`.
- Staff do not see the Team navigation item.
- Current workflow uses a temporary password; outbound invitation email will be added when TEST/PROD email delivery is connected.
