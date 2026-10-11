# Pre-release tenant isolation audit — 2026-10-07

Scope: live Test and production schema/policies/function grants, server billing and support authorization, public terminal/print RPCs, and Android WebView configuration. This is a targeted source/database review, not an independent penetration test or a guarantee against compromise.

## Confirmed issues and fixes

- A disabled or removed business member could retain branch access through an old `branch_users` assignment. `is_branch_member` now requires an active membership in that branch's business.
- A client administrator could attach another tenant's service/catalog/user/role IDs to their own writable records. Database triggers now validate device service branch, employee business role, branch employee membership, and catalog business/branch references. Direct client operations that previously succeeded were reproduced with synthetic tenants before the fix.
- Client billing-table writes allowed arbitrary subscription overrides and client-created payment states/prices. Client INSERT/UPDATE/DELETE grants and write policies are removed. Checkout creates the order through the server admin client only after validating the authenticated owner/admin, plan availability and server-calculated price. Payment webhook and system-owner writes remain trusted server operations.
- Direct browser ticket RPC issuance bypassed the website rate limiter. A database wrapper now limits issuance to 120 requests per terminal per minute. Its internal implementation cannot be called directly by client roles. Stub issuance already had a database limit.
- Trigger functions were unnecessarily executable as public RPCs. Their client EXECUTE grants are removed, the legacy employee-permission RPC is authenticated only, and `set_updated_at` has an explicit search path.
- Direct queue table writes and old `staff_*` RPCs bypassed per-action permissions. Client mutation grants and legacy RPC grants are revoked; the application uses permission-aware `qd_*` wrappers. Real-role tests prove a staff member without cancellation permission is denied while the authorized owner still succeeds.
- Test had a legacy `delete_test_user_by_email` SECURITY DEFINER helper with no caller authorization and authenticated EXECUTE. Production does not have this function. Client EXECUTE is revoked on Test; only the trusted service role can invoke it. The migration safely skips production where absent.

## Validation

- Test migrations applied successfully. Production migration plus synthetic regression tests passed inside a transaction that was rolled back; these security changes are **not yet permanently applied to production**.
- `tests/integration/tenant-boundary.sql` explicitly switches to `authenticated` and `anon`, tests tenant A against tenant B and disabled/removed membership, and rolls back every fixture. Other-tenant business/branch/customer/ticket/device/team/subscription/role reads, mutations, ticket RPC operations, support reads/replies/session creation are blocked; valid own-device writes remain allowed.
- Four production consistency counts were zero: missing business membership behind branch assignments, foreign device services, foreign catalog businesses and foreign employee roles. No existing client records were changed.
- 16 new automated database regressions cover revoked access, cross-tenant references, valid setup, billing ACLs, internal RPC ACLs, Test cleanup ACLs, queue mutation permissions, rate-limit bypass and idempotent migrations. They are included in `npm run test:db`.
- Existing private attachment regression passed after hardening: cross-client denial, revocation, service-only ACLs, upload integrity, retry and archive preservation.
- Local production compile passed with `next build --webpack` (the isolated checkout uses a dependency symlink that Turbopack refuses). The normal Turbopack build is verified by CI.
- Local `npm run quality` passed: lint, typecheck, unit/database/SMS suites and secret scan.
- The Test database migration runner now also runs the real-role isolation SQL when a dedicated Test database connection is configured. Its project/branch safety checks remain enforced.

## Release order and remaining limits

Deploy the checkout server change together with the release candidate, then apply `20261007144253_tenant_boundary_hardening.sql`, `20261007145134_browser_ticket_database_rate_limit.sql` `20261007150233_restrict_test_cleanup_rpc.sql` and `20261007150525_enforce_queue_mutation_entrypoints.sql` to production. Applying billing restrictions before the server change would temporarily block checkout order creation. Do not substitute Test credentials into production.

Run the checked-in isolation SQL in a rollback transaction after production migration, and verify checkout, terminal setup, queue operations and support attachments against the released application. Never send live payment or notification requests as part of a synthetic security test.

Supabase's security advisor still reports leaked-password protection disabled. Enabling it requires project Auth configuration; the available connector does not expose that setting. Review [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) before release. It also reports the managed `pg_net` extension in public; moving it needs separate compatibility review. RLS-without-policy notices on private/server-only tables represent denied direct client access. Intentional token/session-based public RPCs and tenant-authorized privileged functions remain advisor warnings and must retain their scope checks.

Device/session tokens are bearer credentials: a leaked valid token grants its designed terminal/session capability. RLS does not protect a stolen owner's session or compromised server credentials. Production uses HTTPS and disables WebView debugging; this audit did not change or re-sign the Android APK. Actual printer-device testing and wider abuse/load testing remain outside this targeted audit.
