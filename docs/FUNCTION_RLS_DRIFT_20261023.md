# Hosted TEST vs Production: RLS and function drift (2026-10-23)

Read-only comparison of `public` and `support_private` schemas. This supplements `PAYMENT_SCHEMA_PARITY_20261023.md`.

## RLS policies

73 TEST policies and 73 Production policies: identical names, permissive flags, roles, commands, USING and WITH CHECK expressions. **No observed RLS policy drift.**

## Functions

TEST has 101 signatures; Production 98. Of 97 common signatures, 10 have different `md5(pg_get_functiondef(oid))` hashes. Hash differences require semantic review; formatting alone can change hashes.

### TEST-only
- `public.delete_test_user_by_email(text)` — service-role-only test utility; **do not blindly promote to Production**
- `public.finalize_paymongo_checkout_atomic(...)`
- `public.finalize_paymongo_invoice_atomic(...)`
- `support_private.queue_support_report()`

### Production-only
- `public.get_public_branch_queue_unchecked(text,text)` — examine callers and access grants before changing or dropping

### Shared signatures with differing definitions
- `public.can_manage_branch_settings(uuid)`
- `public.can_view_team_profile(uuid)`
- `public.delete_team_member(uuid)`
- `public.handle_new_user()`
- `public.set_assigned_branch_status(uuid,branch_status)`
- `public.set_customer_refresh_seconds(uuid,integer)`
- `public.staff_return_last_to_queue(uuid,uuid)`
- `public.support_attachment_call(text,text,jsonb)`
- `public.support_return_path(text)`
- `public.update_client_configuration_permissions(uuid,boolean,boolean,boolean)`

## Required follow-up

Compare each function body, SECURITY DEFINER setting, search path and grants; identify canonical behavior and dependencies. Rehearse reconciled forward-only migrations on a disposable restore with existing subscription data. Do not run an indiscriminate Production migration push.

Latest TEST Browser E2E failed once on Branch Users Settings navigation and passed on rerun; treat as flaky until root cause is established.

**No Production writes or deployment.**
