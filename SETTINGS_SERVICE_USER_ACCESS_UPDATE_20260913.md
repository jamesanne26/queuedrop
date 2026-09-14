# QueueDrop Settings update — 2026-09-13

Implemented from the latest uploaded project:

- Added an expandable business-wide **Services** section beside Branches.
- Service list now owns service creation/deletion/editing and branch visibility.
- Branch > Services is branch-scoped and assigns services from the business service list using a dropdown; it contains no other-branch selector.
- Branch > Users now shows users for the selected branch and can assign/unassign users from the business user list.
- Users & Access > Users now includes editable direct permission checkboxes, branch-access checkboxes, and a Save access action.
- Branch General save bar now shows only Save Changes; Delete branch has its explanation next to the delete action.
- Existing branch-specific Operating Hours, Queue Settings, Notifications, Appearance, and Terminals remain scoped to the selected branch.

Compatibility note: QueueDrop's existing `services` table is branch-scoped. The new business-wide service list is implemented as a synchronized logical catalog over those branch service rows so existing tickets and terminal service references stay compatible without a destructive database migration. Removing visibility deactivates that branch's service row; deleting a catalog service is blocked when queue history exists.
