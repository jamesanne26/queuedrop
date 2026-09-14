# QueueDrop Unified Settings Workspace — 2026-09-13

## What changed
- Rebuilt Settings as one in-page workspace. Settings hierarchy buttons no longer link to the legacy Branches, Services, Team, Terminals, Client Configuration, or Subscription pages.
- Added instant client-side section switching for branch settings, Services, Users, Roles, Permissions, Business, Billing, and Account.
- Branch switching stays on `/dashboard/settings` and refreshes only the selected branch data.
- Embedded service management, users/access, roles/permissions, terminal management, branch configuration, appearance, billing summary, and account details inside Settings.
- Added Account view at the bottom of the Settings navigation with a dedicated Sign out button.
- Updated server-action redirects for Branches, Services, Team/Roles, Terminals, Queue Settings, and Appearance so successful/error submissions return to the appropriate Settings view instead of legacy pages.
- Added responsive desktop/tablet/mobile styling for the unified workspace.
- Updated owner Settings navigation E2E coverage to verify navigation remains inside `/dashboard/settings`.

## Performance behavior
- Main Settings sections are preloaded on the server and switched client-side, so top-level section navigation does not request a new legacy page.
- Branch selection uses the same Settings route and keeps the selected Settings view.

## Validation performed in this environment
- Static TypeScript syntax pass was run with global `tsc --noResolve`; no non-module syntax/type errors remained in the modified Settings TSX files.
- Verified no legacy Settings-page hrefs remain for `/dashboard/branches`, `/dashboard/services`, `/dashboard/team`, `/dashboard/terminals`, `/client/configurations`, or `/client/subscription`.
- Verified modified branch/service/team/terminal actions no longer redirect to the legacy management pages.

Full `npm run test:all` was not executed here because this extracted project does not contain `node_modules`.
