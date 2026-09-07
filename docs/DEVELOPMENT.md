# Development workflow

## Daily flow

1. Sync `test` and create a short-lived feature/fix branch.
2. Define expected behavior before changing code.
3. Add/update unit tests for pure rules and regression tests for fixed bugs.
4. Implement the smallest coherent change.
5. Run targeted tests while coding; run `npm run quality` before commit.
6. Run `npm run build` before PR when route/server behavior changed.
7. Open a PR. CI must pass and another developer should review meaningful changes.
8. Merge to `test`, deploy TEST, then run integration/smoke/targeted E2E.
9. Promote to production only after release checks pass.

## Code organization

Avoid growing route files into catch-all modules. Extract reusable validation, permission and domain rules to `lib/`. Components should focus on UI behavior; database operations belong in server actions/API/RPC. Refactor incrementally behind tests rather than doing broad rewrites.

## Database changes

Always create a new timestamped migration. Never modify a migration already present on TEST/PROD. Verify `npx supabase migration list --linked` before and after a push. Schema changes and application code that depend on them should be released as one reviewed change.
