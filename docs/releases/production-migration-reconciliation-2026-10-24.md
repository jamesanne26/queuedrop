# QueueDrop Production migration reconciliation — 2026-10-24

## Verified read-only findings

| Check | TEST | PROD |
|---|---|---|
| Migration history versions | 112 | 104 |
| Payment RPC security | PASS | FAIL |
| PayMongo invoice unique index | PASS | FAIL |
| PayMongo invoice reference unique index | PASS | FAIL |
| Index integrity | PASS | FAIL |
| Duplicate PayMongo invoice references | PASS | PASS |
| Support return-path length guard | PASS | FAIL |

Comparison of migration version IDs: **93 shared, 19 TEST-only, 11 PROD-only**. The discrepancy is NOT simply eight missing migrations: some migrations share names but use different IDs, and there are environment-specific operations.

### TEST-only versions
- 20261006055057 queue_reliability
- 20261006064151 test_operations_scheduler_extensions
- 20261006064855 test_scheduler_private_network_permissions
- 20261006070929 printer_claim_fencing
- 20261006204652 central_support_portal
- 20261007140745 support_owner_notifications_only
- 20261011082518 restore_clean_rebuild_permission_catalog
- 20261011082655 harden_sms_server_table_grants
- 20261011082819 align_permission_ceiling_search_path
- 20261011124748 enforce_manager_branch_settings_permission
- 20261011172139 restore_support_return_path_rpc
- 20261011180315 fix_support_return_path_token_hash
- 20261022044710 paymongo_invoice_reference_uniqueness
- 20261022052159 atomic_paymongo_invoice_20261022
- 20261022052205 atomic_paymongo_invoice_rpc_20261022
- 20261022052950 atomic_paymongo_checkout_20261022
- 20261022053759 harden_atomic_paymongo_invoice_20261022
- 20261022074746 atomic_checkout_created_status_20261022
- 20261023031649 reconcile_support_return_path_20261023

### PROD-only versions
- 20261006113645 queue_reliability
- 20261006113655 printer_claim_fencing
- 20261006113854 enable_production_end_of_day_scheduler
- 20261007045514 support_portal_release
- 20261007141036 support_disable_client_email
- 20261011082614 restore_clean_rebuild_permission_catalog
- 20261011082707 harden_sms_server_table_grants
- 20261011082852 align_permission_ceiling_search_path
- 20261011172148 enforce_manager_branch_settings_permission
- 20261011172156 restore_support_return_path_rpc
- 20261011172410 restore_support_return_path_rpc

## Required safe release sequence

1. Compare actual SQL definitions and live schema; do not apply migrations based solely on ID. Preserve PROD-only scheduler and support behavior; exclude TEST-only scheduler/network changes.
2. Obtain verified PROD backup, restore to isolated non-PROD rehearsal DB, and validate rollback.
3. Rehearse reviewed idempotent forward migration on restored clone. Run `supabase/tests/read_only_release_audit.sql` and verify all six checks PASS, including business data integrity.
4. Validate signed PayMongo sandbox webhooks, idempotent retries, checkout and renewals, plus physical PT-210 reconnect/reprint and SMS acceptance.
5. Obtain explicit approval before any Production DB or Vercel production write.

**Release: NO-GO.** This document authorizes no Production changes.
