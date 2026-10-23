# Function definition reconciliation — 2026-10-23

Read-only hosted TEST vs Production comparison of the ten common functions flagged by full `pg_get_functiondef` hashes.

After removing carriage returns and collapsing whitespace with PostgreSQL `regexp_replace`, **8 of 10 definitions match exactly**:

- `can_manage_branch_settings`
- `can_view_team_profile`
- `delete_team_member`
- `handle_new_user`
- `set_assigned_branch_status`
- `set_customer_refresh_seconds`
- `staff_return_last_to_queue`
- `update_client_configuration_permissions`

Two still differ after whitespace normalization:

1. `public.support_attachment_call(text,text,jsonb)` — compare full bodies, grants and report/attachment handling.
2. `public.support_return_path(text)` — TEST implementation comes from forward-only `20261023110000_reconcile_support_return_path.sql`; Production differs.

This reduces *textual* function definition drift; whitespace normalization does not constitute behavioral equivalence. The four TEST-only and one Production-only functions listed in `FUNCTION_RLS_DRIFT_20261023.md` remain to be reconciled separately.

No hosted database writes or Production deployments were made.
