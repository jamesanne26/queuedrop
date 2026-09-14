# Settings, TV display, and users refinement — 2026-09-13

Implemented from the latest uploaded project:

- Dashboard sidebar order: Overview, Queue, TV Display, History; Settings and Sign out remain at the bottom.
- TV Display is a full-screen dashboard route with no sidebar, larger animated LIVE indicator, emphasized WAITING/SERVING headers, and monospaced/tabular ticket-code alignment.
- Settings top heading removes the duplicate eyebrow label.
- Settings root navigation uses one consistent row/caret layout for Branches, Services, Users & Access, Business, and Billing & Subscription. Expandable groups are closed by default.
- Users list shows Name, Email, User role, and edit action only. Role is read-only in the list.
- Edit User > User details now owns the editable role selector. Non-system roles are labeled Custom. Permissions and branch access remain in the Permissions tab.
- Add User opens in a modal instead of expanding inline.
- Business name is editable from Settings > Business with owner/admin authorization.
- Missing operating-hours rows default to 12:00 AM through 11:59 PM.
- Dashboard TEST badges are hidden when `VERCEL_ENV=production`.
- Inputs/selects/textareas receive a subtle field shadow so form controls are easier to distinguish.
- Settings/dashboard label typography is normalized to a more consistent scale.

No database migration is required for this UI/action update.
