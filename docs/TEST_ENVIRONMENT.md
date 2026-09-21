# Automated TEST environment

QueueDrop keeps unit tests isolated from infrastructure. Integration and smoke tests require explicit TEST-only configuration.

## Local behavior

`scripts/run-tests.mjs` automatically reads, when present, `.env.test.local`, `.env.local`, `.env.test`, then `.env`. Existing shell or CI variables win. This means developers do not need to manually export variables every run.

Integration tests deliberately require the `QUEUEDROP_TEST_*` names. They do not fall back to the normal application Supabase URL/key, which reduces the chance of accidentally exercising production.

Normal local command:

```powershell
npm run test:integration
```

If TEST credentials are not configured, infrastructure tests are skipped rather than touching an unknown database. CI or release gates should use:

```powershell
npm run test:integration:required
```

The required form fails when the TEST environment is incomplete, preventing a false-green release gate.

## Required integration variables

- `QUEUEDROP_TEST_SUPABASE_URL`
- `QUEUEDROP_TEST_SUPABASE_SERVICE_ROLE_KEY`
- `QUEUEDROP_TEST_SUPABASE_ANON_KEY`
- `E2E_OWNER_EMAIL`
- `E2E_OWNER_PASSWORD`
- `E2E_FORBIDDEN_BUSINESS_ID`

Use `E2E_FORBIDDEN_BUSINESS_ID` for a second TEST tenant that the E2E owner does not belong to. This makes the RLS isolation assertion meaningful.

Never commit `.env.local` or `.env.test.local`. A sanitized `.env.test.local.example` is committed only as documentation.
