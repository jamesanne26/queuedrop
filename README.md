# QueueDrop

QueueDrop is a multi-tenant web-based queue management SaaS built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Environment model

- DEV: local Next.js + local Supabase via Docker
- TEST: cloud Supabase / cloud web deployment
- PROD: isolated production cloud environment

## Current development milestone

Milestone 2 adds secure owner business onboarding on top of the authentication foundation:

1. User signs up / signs in.
2. Authenticated user creates the initial business workspace.
3. One atomic PostgreSQL RPC creates the business, owner membership, first branch, branch membership, queue defaults, and audit record.
4. The dashboard reads the new workspace through the existing RLS policies.

## Local development

```bash
npm install
npx supabase start
npx supabase migration up --local
npm run dev
```

Local environment values belong in `.env.local` and must never be committed.
