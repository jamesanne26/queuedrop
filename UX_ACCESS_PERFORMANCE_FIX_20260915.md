# QueueDrop UX, access, and Settings performance fix — 2026-09-15

Implemented from owner QA screenshots/video:
- Settings review confirmation renders at the viewport level so it is no longer clipped into a small scrolling rectangle.
- Global save/loading overlay also renders at the viewport level.
- Branch switching uses one loading overlay instead of duplicate indicators.
- Add Branch changes to Cancel while the form is open.
- Terminal protected-exit PIN characters/dots remain visible on themed terminals.
- Create User now shows global Please wait feedback.
- New Staff/own-branch users require a branch at creation; selected-branch roles can choose branches; all-branch roles need no branch assignment.
- Queue and TV respect Manager all-branches role scope.
- Terminal shortcut in Queue is permission-based and is hidden from Staff without kiosk-management access.
- Sidebar Account submenu now contains My Account and Sign out.
- My Account supports profile changes plus optional password change; permission-management link only appears for roles with that authority.
- Role Save/Delete actions moved to the lower-right editor footer; Create Custom Role remains isolated at the upper-right.
- Settings data fetching is view-aware so normal saves/tabs no longer fetch service, team, permission, terminal, and billing datasets unnecessarily.
- Settings visibility remains permission-based: default Staff has no Settings menu unless its role is granted a Settings/management permission.

Database migration `20260915034000_backfill_unassigned_own_branch_users.sql` repairs legacy active own-branch users that have no branch assignment so existing Staff accounts no longer bounce back from Queue/TV solely because of the old creation bug.
