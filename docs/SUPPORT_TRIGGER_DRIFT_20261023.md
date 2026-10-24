# Hosted trigger parity (2026-10-23)

Read-only inspection of `pg_trigger` joined to `pg_class` and `pg_namespace`, excluding internal triggers, limited to `public` and `support_private`.

- TEST: 32 user-defined triggers.
- PROD: 31 user-defined triggers.
- All 31 shared triggers have identical `pg_get_triggerdef` definitions.
- TEST-only trigger: `public.support_reports.support_report_notification`:

```sql
CREATE TRIGGER support_report_notification
AFTER INSERT ON public.support_reports
FOR EACH ROW EXECUTE FUNCTION support_private.queue_support_report();
```

The referenced `support_private.queue_support_report()` function is also TEST-only (per the prior function-signature inventory). **Do not create this trigger in Production without first verifying its function, dependencies, execution grants, operational behavior, and desired support-notification delivery.**

This is a schema drift finding, not proof that support notifications are broken. Production was not modified. Include the trigger/function pair in a forward-only migration rehearsal on a disposable Production-like restore. Confirm notifications and rollback before requesting release approval.
