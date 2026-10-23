# Support RPC semantic review — 2026-10-23

Read-only comparison of full hosted TEST and Production function bodies.

## `public.support_attachment_call(text,text,jsonb)`

Both environments implement the same operation branches (`list`, `download`, `reserve`, `complete`, `abort`), session/detail authorization checks, uploader checks, attachment count and rate limits, MIME allowlist, advisory lock, and storage metadata validation. Observed textual differences are indentation, line breaks and statement formatting. **No behavior difference identified by manual source review**; this is not a substitute for execution tests.

## `public.support_return_path(text)`

Both call `support_call(...,'context',...)`, retrieve the session's `source_page` using a hashed token, validate the same anchored `/dashboard` or `/system` path regex and otherwise return `/dashboard`.

**Material difference:** TEST additionally rejects `source_page` longer than 500 characters. Production has no explicit length guard. The TEST forward-only canonical implementation is in `supabase/migrations/20261023110000_reconcile_support_return_path.sql`. Deploy it only as part of a rehearsed, approved migration plan.

## Remaining release risks

- Hosted TEST-only and Production-only function signatures need separate dependency and privilege review.
- Migration history IDs diverge; do not blindly replay all repository migrations against Production.
- Production still lacks atomic PayMongo RPCs and two invoice uniqueness indexes.
- Real PayMongo sandbox webhook, printer reconnect and SMS acceptance tests remain outstanding.

No Production mutations were made.
