# Cloudflare migration readiness — QueueDrop

Status: PREPARATION ONLY. Do not point production DNS here until all gates pass.

## Platform choice
- Keep Next.js/Vercel as a known-good rollback until Cloudflare Workers compatibility is demonstrated.
- Evaluate Cloudflare's vinext compatibility checker (`npx vinext check`) against the pinned Next.js app; vinext is beta. If unsupported, evaluate OpenNext separately.
- Keep Supabase PostgreSQL/Auth/RLS; do not copy or merge databases or secrets between apps.
- Use separate Cloudflare Workers deployments for TEST and PROD, with separate environment bindings and secrets. Never commit credentials.

## Required release gates
1. Run npm ci, lint, typecheck, unit tests and production build on the proposed Cloudflare branch.
2. Run the vinext compatibility check and resolve all unsupported Next.js APIs; validate SSR, middleware, cookies, auth redirects and route handlers in actual Workers runtime.
3. Configure TEST-only Supabase URL/keys, callback origins, CORS, external provider callbacks, and build-time public variables in Cloudflare dashboard.
4. Deploy TEST to a new workers.dev hostname, without changing production DNS.
5. Execute tenant isolation/RLS, login/logout, CRUD, webhook signature/retry/idempotency, negative security cases and E2E browser tests against TEST.
6. Verify logging, rate limits, backups/restore, monitoring, rollback and acceptable latency/cost under load.
7. Deploy PROD to a separate Worker using PROD-only secrets, validate health and smoke checks, then switch DNS only after explicit go/no-go review.

## App-specific checks
- Queue concurrency: simultaneous ticket creation/call-next, position updates, realtime subscriptions, end-of-day transitions.
- Print Bridge APK/web endpoints and thermal printer reconnect/reprint.
- PayMongo checkout/renewal/webhook and SMS provider failure behavior.

No production release is authorized by this checklist alone.
