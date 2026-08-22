# QueueDrop Update Package

This package keeps the existing Supabase schema and migrations and adds the first application-code foundation.

## Added

- Supabase browser client (`lib/supabase/client.ts`)
- Supabase server client (`lib/supabase/server.ts`)
- Supabase session refresh helper and Next.js `proxy.ts`
- Email/password sign-in and sign-up flow
- PKCE auth callback route
- Protected `/dashboard` shell
- QueueDrop responsive landing page
- `/api/health` endpoint
- `.env.example`
- Updated README

## Safe copy workflow

Do **not** overwrite your existing `.env.local` or `.git` folder.

1. Back up `C:\queuedrop`.
2. Extract this package to a temporary folder.
3. Copy the package contents into `C:\queuedrop` and allow source files to replace existing files.
4. Keep your existing `C:\queuedrop\.env.local` and `C:\queuedrop\.git` untouched.
5. Run `npm install`.
6. Start Docker Desktop and run `npx supabase start`.
7. Run `npm run dev`.
8. Open `http://localhost:3000`.

## Environment variables

Your local `.env.local` should contain at least:

- `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000`
- `NEXT_PUBLIC_SUPABASE_URL=...`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...`

`SUPABASE_SECRET_KEY` is reserved for later server-only workflows and must never use a `NEXT_PUBLIC_` prefix.
