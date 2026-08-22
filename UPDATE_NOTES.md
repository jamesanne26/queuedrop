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
