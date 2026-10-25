# Scoped Production delta rehearsal — 2026-10-24

This candidate addresses the five failed audit checks without copying TEST-only scheduler/network migrations or rewriting migration history.

Read-only comparison of the 77 columns in payments, subscription_orders, business_subscriptions and support_private.sessions found no differences between TEST and Production. This verifies column compatibility only.

The generator reads four existing canonical migration files and emits one transaction with duplicate-invoice preflight, bounded lock/statement timeouts, restricted payment RPC grants and in-transaction verification. It never connects to a database. Production execution is not part of CI.

The disposable CI fixture reproduces only the observed missing payment functions, missing indexes and previous support return-path function. CI verifies the five failures, applies the candidate with ROLLBACK and compares the original audit, applies twice with COMMIT, requires six passes, then runs existing concurrent checkout/invoice tests and synthetic backup/restore.

This is NOT a restored Production backup and does not close the Production backup/restore gate. Signed provider sandbox webhook acceptance, actual PT-210/SMS delivery and a verified Production backup/rollback remain required. A transaction rollback rehearsal does not reverse payments made after a committed deployment.

No live database writes or Production deployments are performed by this change.
