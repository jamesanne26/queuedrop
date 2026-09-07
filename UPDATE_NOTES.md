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

## Milestone 7 — Queue Configuration & Operating Rules

- Added `/dashboard/settings` for business Owner/Admin only.
- Per-branch queue prefix, starting number, no-show grace period, QR/public join toggle, queue active toggle, contact visibility, and timezone.
- Weekly operating-hours editor.
- Public queue joining is now enforced against branch operating hours at the database RPC layer.
- Customer join page shows a closed state outside configured hours.
- Operating-hours visibility is branch-scoped for staff while Owner/Admin remain business-wide.
- Anne Salon / Commonwealth DEV seed is intentionally open all days so seeded queue tickets remain deterministic during local resets.

## Milestone 7.1 — Position notifications and queue data edits
- Branch-specific position notification rules (SMS/browser flags; delivery provider wiring comes later).
- Customer/Staff/Manager edit permissions for queue name/mobile.
- Ticket-level customer detail overrides so edits do not rewrite historical customer master data.
- Staff-visible change history with actor type and timestamp.
- Managers can open Settings for assigned branches only; Staff cannot.


## Queue Live View Reliability & Loading Fix — 2026-08-26

This package includes the latest live-queue UX fixes:

- Queue RPC errors now expose the actual Supabase/Postgres error message instead of collapsing non-`Error` PostgREST errors into `Queue action failed.`
- Serve, Complete, No-show, Call next, and customer Save buttons now show an action-specific pending state and prevent duplicate submissions.
- Global `Please wait` loading is explicitly cleared when a server-action result completes, preventing the loading overlay from remaining after a successful assisted queue add.
- Branch selector navigation now shows the global loading state during branch transitions and clears it when the transition completes.
- Queue loading controls use the existing transition/prefetch architecture rather than adding another page-level loading mechanism.

## 2026-08-27 Team access refinement
- Staff creation/edit now requires mobile; email stays optional.
- Manager creation/edit requires email and mobile; existing branch/password rules remain enforced.
- Edit password is now optional: blank keeps the existing password; entering a value resets it.
- Existing passwords are never retrieved or pre-populated because Supabase Auth stores password hashes, not readable plaintext.
- Team branch filtering is now client-side after the initial page load, avoiding a server round trip on every branch selection.

## 2026-08-28 - Settings repair

- Restored the missing `save_branch_queue_settings` and `can_manage_branch_settings` RPCs through a new repair migration for TEST schema drift.
- Removed the branch queue prefix control from Settings; service-level prefixes remain unchanged, while the existing branch fallback prefix is preserved during saves.
- Cleaned corrupted branch selector text and simplified the Settings wording.
- Hardened the Settings layout for mobile screens, including the branch selector, save action, cards, and position-rule controls.

## 2026-08-28 - Client Page and configuration access

- Added a separate `/client` administration workspace for Owner/Admin, opened from a new **Client Page** button above Sign out.
- Added `/client/configurations` with per-Branch-Manager access controls for **Queue information editing**, **Position notifications**, and **Allow branch active / inactive**.
- Added audited database permissions for those client-level controls.
- Branch Managers with branch-status permission can activate/deactivate only their assigned branches without receiving full branch-edit/delete access.
- Settings now hides Queue information editing and Position notifications from managers unless Client Configurations enables them.
- Removed the **Queue rules** section from the Settings UI for now while preserving its existing stored values during unrelated saves.
- Added responsive Client Page and Configurations layouts for desktop, tablet, and mobile.

## 2026-08-28 - Client Configurations user management
- Client Configurations now lists every business user with name, email, role, and the three configuration permissions.
- Added a settings icon per user that opens a responsive user-settings modal.
- Modal includes validated profile details, employee role, account status, branch assignment, optional password reset, and manager-only configuration permissions.
- Save validates name, email, mobile, role, branch assignment, password rules, duplicate mobile, and business ownership of branches.
- Delete requires exact full-name confirmation, blocks self-deletion, and protects Owner/Admin accounts.
- Staff must have exactly one branch; Branch Managers must have at least one branch.
- Owner/Admin configuration permissions remain always enabled and protected.

## 2026-08-28 — Mobile stabilization + History & Reports

- Restored mobile Sign in action on the public home page.
- Made branch/settings/team dialogs mobile-safe with viewport-fit scrolling and sticky actions.
- Reworked mobile live queue rows into responsive cards instead of a horizontally oversized table.
- Removed mojibake/encoding artifacts in queue UI text.
- Prevented the global submit loader from interfering with mobile team-member creation.
- Hardened manager team actions to require `can_manage_team` server-side.
- Added History & Reports to dashboard navigation before Settings.
- Added role-aware report visibility/export permissions (Owner/Admin business-wide; Manager configurable and branch-scoped; Staff default denied).
- Added report filters for date range, branch, service, status, and report type.
- Added detailed history, queue summary, and service performance report modes.
- Added TXT, CSV, PDF, DOCX, and XLSX downloads without new runtime packages.
- Restored `20260828103000_role_permission_matrix.sql` to source history for environment consistency.

## 2026-08-28 Mobile hardening v4.0
- Contained dashboard/mobile header and sidebar to viewport; prevents page-wide horizontal panning.
- Hardened Live Queue mobile layout: single-column panels, responsive QR, stacked actions, card queue rows, no horizontal table canvas.
- Hardened Settings mobile cards/permissions/hours to one-column viewport-safe controls.
- Replaced vulnerable decorative Unicode separators on queue/team mobile surfaces with ASCII-safe separators to avoid mojibake artifacts.
- Kept visible role wording as `Manager` (database enum remains `manager`).
- Added `20260828120000_save_branch_queue_settings_compat.sql`, a backwards-compatible RPC overload for old Settings deployments that omit `target_ticket_prefix`.

## 2026-08-28 — Customer Portal + System Owner + Configurable SaaS Pricing

- Added screenshot-style customer queue position experience, private queue list, configurable auto-refresh, customer self-edit controls, and 6-character leave-queue confirmation.
- Added staff customer-position popup from queue number/customer name.
- Added one-login role routing: System Owner -> `/system`, Staff -> `/dashboard/queues`, Business Owner/Admin/Manager -> `/dashboard`.
- Added System Owner console for client/subscription/payment visibility.
- Added `/system/plans` for editable prices, branch limits, active queues, service limits, trial days, visibility, and subscription availability.
- Added per-client subscription overrides for custom price/limits with expiry/reason.
- Added grandfathered monthly billing price. Plan edits affect new subscribers by default; System Owner can explicitly apply a price to existing active subscribers.
- Added public `/pricing` and client `/client/subscription` plan/billing experience.
- Added PayMongo checkout/webhook integration hooks (TEST keys/webhook registration still required externally).
- Added Starter trial assignment for newly created self-service workspaces.
- Added database enforcement for subscribed/trialing branch and service/active-queue limits.
- Added system audit log table for plan and client override changes.

## 2026-09-05 — Stub-first QueueDrop

- Customer entry is now designed around a physical QueueDrop ticket terminal.
- No customer name or mobile number is required to get a queue ticket.
- Added `/kiosk/[deviceToken]` fullscreen GET STUB terminal screen.
- Added kiosk ticket API and native printer bridge contract.
- Added Dashboard > Terminals for owner/admin device registration.
- Added DB Stub Mode configuration, terminal-to-service binding, ticket source/device/printed tracking, and secure terminal RPCs.
- Printed stub QR opens the existing private `/q/status/[token]` live status page.
- Live status now offers optional SMS opt-in instead of customer name editing.
- Existing dashboard, roles, reports, queue operations, notifications, subscriptions, services and branches remain reusable SaaS capabilities.
- Legacy public/QR joining is disabled by the migration but retained in the codebase as a future optional mode.

Hardware note: direct built-in thermal printing requires the QueueDrop Android WebView wrapper to expose `QueueDropPrinter.printStub(...)`; see `docs/STUB_TERMINAL.md`.

## 2026-09-05 Queue responsiveness fix
- Live Queue no longer refreshes the entire server route every 5 seconds. It subscribes to branch-scoped ticket changes through Supabase Realtime and refreshes only after a ticket insert/update/delete, with manual Refresh as fallback.
- Queue View loads active tickets directly by branch/status instead of depending on a separate queue-session lookup, fixing newly issued test stubs not appearing in Waiting.
- Dashboard layout role/permission lookup reduced to one business_users query.
- Removed eager programmatic prefetch of every dashboard page from the sidebar.
- Queue server actions reuse their authenticated user lookup instead of immediately requesting it again.

## 2026-09-06 Queue responsiveness + cancellation safety
- Queue success/error banners are now one-time flashes and remove their URL parameters without a reload.
- Global submit loading now clears on completed Next.js navigation/query-string redirects and has a shorter safety timeout.
- Queue SMS dispatch is deferred with Next.js `after()` so queue actions return before external SMS delivery work finishes.
- Live Queue only renders tickets from the branch's current open daily queue session, preventing stale/duplicate active tickets from old sessions.
- Waiting-ticket cancellation now requires a 4-digit verification code in a confirmation modal before the cancel action can be submitted.

## 2026-09-06 - Live Queue operator workflow v4
- Replaced the Called panel with Pending (DB keeps `called` internally for compatibility).
- Call next now moves the first waiting stub to Pending, not directly to Serving.
- Serving cards now expose Complete, Return to last, and Move to pending.
- Pending cards expose Move to serving and Cancel.
- Removed the top Return last command.
- Added verification-code confirmation for Return to last, matching Cancel protection.
- Added combined Business / branch selector to the Live Queue header.
- Queue numbers are clickable and open the actual customer `/q/status/[token]` page inside a phone-shaped preview.
- Customer mobile/SMS presence is visible through a mobile icon and the preview shows the saved SMS number.
- Queue action forms use local pending buttons instead of the blocking global Please wait overlay.
- Added migration 20260906010500_queue_pending_operator_controls.sql.

## 2026-09-06 Queue operator v5
- Fixed clipped Now Serving/Pending action buttons.
- Added exact-ticket return-to-last RPC with verification flow.
- Removed nested Current Queue scroll on customer status page.
- Added sticky upper-right customer position/status indicator when hero status scrolls out of view.


## 2026-09-06 - Queue operator v6
- Added Dashboard button beside Call next on Live Queue.
- Removed obsolete Add customer / Edit customer permissions from active configuration UI/types.
- Saving employee configuration now explicitly disables legacy add/edit-customer permissions for the stub-only workflow.

## 2026-09-06 — Get Stub Print Bridge + protected mobile kiosk exit
- Added durable `print_jobs` queue for web → QueueDrop Print Bridge → thermal printer.
- Added secure device-token claim/complete APIs with retry/backoff and duplicate-print protection.
- Kept legacy `QueueDropPrinter.printStub(...)` compatibility during APK transition.
- Added mobile-only **Get Stub** side-navigation entry and terminal launcher.
- Added PIN-protected Back button when kiosk mode is launched from the dashboard.
- Added owner/admin Settings control for the kiosk exit PIN; PIN is bcrypt-hashed with pgcrypto.
- Added failed-PIN lockout after five attempts for one minute.

## 2026-09-06 — Multi-service Get Stub terminal update
- Get Stub now has a large green tactile **PRESS HERE / to get stub** kiosk button based on the supplied reference.
- A ticket terminal is assigned to one branch and a **default service**; the default is preselected when kiosk mode opens.
- Customers can choose any active service in the terminal's branch before requesting a printed stub.
- Multiple terminals can intentionally use the same default service; there is no one-terminal-per-service restriction.
- Stub tickets now send the selected service to the backend and create the durable Print Bridge job for that service.
- The older one-argument `issue_stub_ticket` RPC remains compatible and uses the terminal default service.
- Get Queue remains browser-only and redirects the phone to the live queue/status page; it does not create a print job.
- New migration: `20260906170000_multiservice_stub_terminals.sql`.


## 2026-09-06 — Single terminal launcher
- Replaced the duplicate `Open Get Stub` and `Open Get Queue` actions on Dashboard → Terminals with one `Open Terminal` button.
- `Open Terminal` launches the configured kiosk/terminal view.
- Browser-only `Get Queue` is still available from the dashboard navigation for phone-only/no-printer usage.
- No database migration is required for this UI-only change.

## 2026-09-06 — Instant Live Queue Sync
- Live Queue now applies Supabase ticket INSERT/UPDATE/DELETE events directly to the visible queue before the background server refresh completes.
- Added ticket-number-aware local position recalculation for waiting queues.
- Realtime remains the primary transport; no 1-second polling loop was added.
- Added reconnect status (`Live connected` / `Reconnecting…`).
- Added lightweight 12-second fallback refresh only while the realtime websocket is disconnected.
- Refreshes on browser focus/visibility restore and when internet connectivity returns.
- Queue refresh deferred by an open confirmation/preview modal is replayed after the modal closes instead of being lost.
- No database migration is required for this update; `tickets` is already part of the `supabase_realtime` publication in the project schema.

## 2026-09-06 — Live Queue no-manual-refresh hardening
- Live Queue now subscribes directly to `tickets` Postgres changes inside the workspace state instead of relying only on a cross-component browser event.
- Subscription is intentionally unfiltered at the Realtime server layer; authenticated RLS still scopes readable rows, and the workspace filters by selected branch client-side. This avoids missed filtered change events.
- Added a lightweight 2.5-second reconciliation while the Live Queue tab is visible. Realtime remains primary; reconciliation is a safety net for dropped WebSocket events/browser sleep/Wi-Fi transitions.
- Reconciliation reads only active tickets for the selected branch/current open queue session and updates the existing React state; no manual refresh is required.
- No database migration required for this update.

## 2026-09-07 — Engineering hardening foundation

- Added in-repository unit, integration and deployment-smoke test structure.
- Added 33 passing unit tests for access rules, service queue positions, terminal appearance/path validation and SMS normalization.
- Extracted reusable dashboard access, queue position, terminal appearance and phone normalization logic into `lib/`.
- Added CI quality gates, TEST checks, nightly foundation and Dependabot configuration.
- Added architecture, authorization, database, development, testing, deployment, technical-debt, maturity and repository-setting documentation plus ADRs.
- Added sanitized `.env.example`, contributor workflow, PR template and lightweight secret scanner.
- Existing external Playwright regression runner is intentionally not discarded; migrate its independent scenarios incrementally into `tests/e2e/regression/`.
