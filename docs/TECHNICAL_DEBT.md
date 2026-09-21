# Technical debt register

This is a prioritized engineering backlog, not a rewrite request.

## High priority

1. Expand unit coverage around queue settings validation, roles/permissions, subscriptions and notification decisions.
2. Migrate the existing Playwright runner into the repository gradually and make smoke/regression suites independently runnable.
3. Add true RLS tenant-isolation integration tests using dedicated TEST identities/businesses.
4. Add CI deployment hooks so post-TEST smoke runs after the hosting platform reports a successful deployment.

## Medium priority

1. Decompose large files incrementally; `app/dashboard/team/actions.ts` and large settings/team components are first candidates.
2. Consolidate repeated auth/membership context helpers where doing so reduces divergent permission logic.
3. Add typed database contracts/code generation when Supabase schema workflow is stable.
4. Add visual regression for phone/iPad portrait queue and terminal views.

## Rule

Do not refactor large working areas without behavior tests first. Prefer one bounded extraction per feature PR.
