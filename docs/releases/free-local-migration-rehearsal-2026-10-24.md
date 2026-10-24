# QueueDrop — no-additional-cost local migration rehearsal

**Purpose:** Find migration errors before Production changes without purchasing Supabase branching or modifying either live database.

## Requirements
- Local Docker Desktop running (check licensing for your organization), Supabase CLI already installed, Node/npm.
- Free disk space for local Postgres containers. Do not use production credentials.
- A clean, isolated local database with **synthetic** data. Local fresh migrations are not equivalent to a restore of Production.

## Safe PowerShell workflow (from C:\queuedrop)

```powershell
git fetch origin
git checkout test
git pull --ff-only origin test
supabase --version
docker version
supabase start
supabase db reset --local
```

**WARNING:** `supabase db reset --local` **deletes local database data**. Only run after confirming this is a disposable local Supabase instance. Never use `--linked`, `--db-url`, `supabase db push`, or production project links in this workflow.

Review the local reset logs; a failure can indicate migration order, unsupported SQL, extension, or dependency issues. The local reset replays repo migration files, but it does **not** reproduce Production's divergent migration history.

## Local verification

After the local reset, inspect the local database with Supabase Studio and run `supabase/tests/migration_replay_assertions.sql` and `supabase/tests/read_only_release_audit.sql` against **local only**. Do not assume all assertions pass on a blank local database if they require seeded PayMongo tables or rows. Never point these scripts at PROD in write mode.

Run application tests separately:

```powershell
npm ci
npm run
```

Use the scripts shown by `npm run` to select the repo's supported unit/typecheck/lint commands. The CI workflows remain the canonical checks.

## Production-specific gap

The live read-only audit on 2026-10-24 returned 6/6 PASS on TEST and 1/6 PASS on PROD. Five failing PROD checks concern atomic PayMongo RPC security, two invoice uniqueness indexes and integrity, and support return-path length guard.

Migration histories are divergent: 93 shared version IDs, 19 TEST-only and 11 PROD-only. **Do not run all TEST migrations against PROD.** Some have environment-specific scheduler/network behavior and version IDs differ even for equivalent changes.

A fresh local reset is only phase 1. Before PROD approval, review exact SQL definitions against the read-only live schema, then perform an isolated rehearsal on a properly sanitized Production backup if available. Production backup/export and restore availability must be verified, not assumed.

## Exit gates

- Local migration replay passes and local assertions reviewed.
- Production-specific migration delta reviewed and isolated from TEST-only scheduler changes.
- PayMongo signed sandbox checkout/webhook/renewal and duplicate-event acceptance.
- Printer PT-210 offline/reconnect/reprint and SMS delivery verified with actual hardware/provider.
- Backup/restore and rollback plan validated.
- Explicit approval before any Production write or deployment.

**NO-GO until all gates pass.** No additional paid services are authorized.
