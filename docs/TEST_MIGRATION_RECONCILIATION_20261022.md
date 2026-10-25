# TEST migration reconciliation — evidence and disposition

Captured 2026-10-22. Repo `test`: **106** migration SQL files; TEST `supabase_migrations.schema_migrations`: **111** version rows.

## Repository-only version IDs (six)
| Repository migration | TEST corresponding applied migration |
|---|---|
| 20261010193000_restore_clean_rebuild_permission_catalog | 20261011082518_restore_clean_rebuild_permission_catalog |
| 20261011101500_harden_sms_server_table_grants | 20261011082655_harden_sms_server_table_grants |
| 20261011101600_align_permission_ceiling_search_path | 20261011082819_align_permission_ceiling_search_path |
| 20261011171100_restore_support_return_path_rpc | 20261011172139_restore_support_return_path_rpc |
| 20261022180000_atomic_paymongo_invoice | 20261022044710 / 20261022052159 / 20261022052205 / 20261022053759 PayMongo invoice patches |
| 20261022190000_atomic_paymongo_checkout | 20261022052950 / 20261022074746 PayMongo checkout patches |

## TEST-only applied versions (eleven)
- 20261011082518 restore_clean_rebuild_permission_catalog
- 20261011082655 harden_sms_server_table_grants
- 20261011082819 align_permission_ceiling_search_path
- 20261011172139 restore_support_return_path_rpc
- 20261011180315 fix_support_return_path_token_hash
- 20261022044710 paymongo_invoice_reference_uniqueness
- 20261022052159 atomic_paymongo_invoice_20261022
- 20261022052205 atomic_paymongo_invoice_rpc_20261022
- 20261022052950 atomic_paymongo_checkout_20261022
- 20261022053759 harden_atomic_paymongo_invoice_20261022
- 20261022074746 atomic_checkout_created_status_20261022

## Verification performed
Read-only SQL against actual TEST: checkout/invoice RPCs exist, are SECURITY DEFINER, have advisory and row locks, only service_role can execute; invoice reference unique index exists. Both SQL regression suites passed. This confirms selected **current invariants**, not complete equivalence of historical migration effects.

## Safe reconciliation policy
- **Do not** delete/rename migration history or replay the six repo-only migrations into TEST: these may duplicate or override existing applied changes.
- **Do not** claim schema parity from matching counts or similar names. In particular, the TEST-only support token hash fix requires source-controlled canonical equivalent verification.
- Reconcile through source-controlled forward-only migrations after schema-diff and dependent-object checks; run clean database replay and then verify TEST's effective schema.
- Production must remain untouched until those checks and the external acceptance gates pass.

**Disposition: inventory completed; full schema parity NOT YET VERIFIED.**
