# Permission and branch duplication hardening — 2026-09-15

- Branch duplication now copies services plus catalog assignments, operating hours, queue settings, notification rules/SMS settings, timezone and terminal appearance. Branch users and terminals remain excluded.
- Branches navigation shows active/inactive counts.
- Owner/Admin terminal appearance can optionally apply the saved appearance to all branches.
- Settings lazy-loaded views now navigate through the server so Services/Users/Roles/etc. load their real data when selected.
- Settings routes are permission-gated, not merely hidden in the UI.
- Queue/TV visibility follows `view_live_queue`.
- Queue action buttons and server actions follow the exact queue permission flags (call, serve, move pending, return last, complete, cancel, no-show).
- Queue history follows `view_history`.
- New DB wrappers enforce queue permissions even when RPCs are invoked directly by an authenticated client.
- Manage Services RLS now honors the explicit `manage_services` permission for non-admin roles.
