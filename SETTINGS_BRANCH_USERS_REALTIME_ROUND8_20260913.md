# Settings branch/users refinement — 2026-09-13

Implemented from the latest uploaded project source:

- Branches stay expanded after selecting a branch; selected branch changes via the green indicator.
- Branch/tab switching no longer forces the page to scroll to the top.
- Removed the Settings console remount key so local navigation state survives branch/server refreshes.
- Branch Users is now a read-only assigned-user list with Add user and Remove user actions.
- Add user opens a modal and assigns one eligible user to the selected branch.
- User Permissions shows assigned branches as a read-only list; branch access is managed only from Branch Users.
- Saving user details now revalidates `/dashboard/settings`, so role/name changes reflect without a manual browser refresh.
- Saving permissions no longer overwrites branch assignments.
- Branch and catalog-service deletion now require a generated 4-digit verification code.
- Existing branch-scoped settings/database structure is retained; no new migration is required for this round.

Validation performed in the sandbox:
- TypeScript syntax transpilation passed for every touched TS/TSX file.
- Full `npm run typecheck` could not be completed because the uploaded ZIP does not contain `node_modules`; the resulting errors were missing dependency/type packages rather than source parse errors.
