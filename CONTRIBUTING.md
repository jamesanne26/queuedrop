# Contributing to QueueDrop

## Working agreement

- Create a short-lived branch: `feature/<topic>`, `fix/<topic>`, `refactor/<topic>`, `test/<topic>`, or `docs/<topic>`.
- Keep application changes and their tests in the same pull request.
- Do not edit an already-applied migration. Add a new forward migration.
- Do not place service-role credentials, user passwords, real phone numbers, or production exports in Git.
- Prefer small refactors around changed code over unrelated rewrites.

## Before requesting review

Run:

```bash
npm run quality
npm run build
```

If the change touches Supabase/RPC/RLS, also run the appropriate integration checks against TEST. If it changes queue/terminal/customer flows, run smoke and targeted E2E.

## Review checklist

Reviewers should check correctness, tenant isolation, authorization at the server/database boundary, migration safety, error handling, test coverage, accessibility/responsiveness, and rollback/recovery implications.
