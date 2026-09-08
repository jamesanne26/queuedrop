# QueueDrop SMS Queue Position Alerts

QueueDrop SMS is implemented as a durable notification outbox. Queue changes enqueue SMS jobs in Supabase; the web dispatcher delivers them through the configured provider without blocking queue operations.

## Customer behavior

Each branch can enable **automatic SMS queue updates** and select a starting position. If the branch uses position `3`, a stub holder who opted in receives one SMS when the stub reaches 3rd, another at 2nd, and another at 1st. The unique notification index prevents a ticket from receiving the same queue-position SMS twice.

Customers opt in from their private stub-status page. The form includes a country-code selector and stores an E.164-style digit string (for example `639171234567`, without the `+`). The number is used only for that stub's queue alerts.

## TEST environment first

Use dry-run mode in TEST so the entire outbox/routing/retry pipeline can be exercised without sending paid SMS:

```env
SMS_DRY_RUN=true
SEMAPHORE_API_KEY=your_test_or_real_semaphore_key
SEMAPHORE_SENDER_NAME=your_approved_sender_name
SMS_DISPATCH_SECRET=generate-a-long-random-secret
```

With `SMS_DRY_RUN=true`, QueueDrop marks a provider attempt as simulated and does **not** call Semaphore. Set it to `false` only when you intentionally want to send a real SMS.

The existing Supabase service-role environment variable is also required by the server-side dispatcher:

```env
SUPABASE_SERVICE_ROLE_KEY=your_test_supabase_service_role_key
```

or the project's existing `SUPABASE_SECRET_KEY` fallback.

## Provider

The current cloud provider implementation is Semaphore for Philippine delivery. The provider is represented in `sms_delivery_methods`; the secret itself never goes into the database. The row stores only the environment-variable name (`SEMAPHORE_API_KEY`).

The routing foundation also supports future System Owner and branch-owned Android SMS gateways. Those gateway rows are deliberately not sent by the web dispatcher; they require the companion Android gateway implementation.

## Database migration

Apply all pending migrations to the TEST Supabase project, including:

```text
supabase/migrations/20260908110000_sms_delivery_hardening.sql
```

This migration adds durable retry metadata, SMS opt-in timestamps, route uniqueness, and stricter international-number storage.

## Delivery lifecycle

1. Queue mutation or customer SMS opt-in calls `enqueue_branch_position_notifications`.
2. A unique `notifications` row is created for the ticket + position.
3. The dispatcher atomically claims the row (`pending` -> `processing`).
4. QueueDrop resolves branch -> business -> country -> system routing, then provider/fallback methods.
5. Every provider attempt is written to `sms_delivery_attempts`.
6. Success marks the outbox row `sent` and stores the provider message ID.
7. Failure schedules exponential retry (30s, 60s, 120s, ... capped at 15m) up to the route retry limit.
8. Exhausted jobs become `failed` and can be retried by the System Owner.
9. Jobs stuck in `processing` for more than five minutes are automatically recovered.

Queue operations always remain successful even if SMS delivery fails.

## Dispatcher endpoint

Queue actions already attempt delivery after successful queue changes. For reliable retry processing, QueueDrop also exposes a protected worker endpoint:

```text
GET or POST /api/internal/sms/dispatch
Authorization: Bearer <SMS_DISPATCH_SECRET>
```

Call this endpoint from the production scheduler of your choice. It processes up to 100 due SMS jobs. Never expose `SMS_DISPATCH_SECRET` in client-side code.

## System Owner operations

`/system/sms` now shows:

- TEST dry-run vs live-delivery status
- Semaphore and dispatcher-secret configuration state
- pending / processing / sent / failed totals
- manual dispatch and retry-failed controls
- country routing and fallbacks
- recent SMS outbox jobs with masked recipients
- delivery-attempt audit trail
- paired Android gateway inventory

## Files

- `lib/notifications/phone.ts` — country selection, normalization, validation, masking.
- `lib/notifications/sms.ts` — routing, provider dispatch, retry/fallback, attempt logging.
- `app/q/status/[token]/*` — customer SMS opt-in.
- `app/system/sms/*` — System Owner SMS operations.
- `app/api/internal/sms/dispatch/route.ts` — protected scheduled dispatcher.
- `supabase/migrations/20260908110000_sms_delivery_hardening.sql` — durable SMS schema.
- `tests/unit/phone.test.mjs` — SMS number tests.
- `tests/integration/supabase-schema.test.mjs` — SMS schema regression coverage.

## UI-driven provider switching (Generic HTTP adapter)

QueueDrop no longer requires provider-specific queue logic for standard REST SMS services. System Owners can configure a cloud provider under **System > SMS** and switch the Philippines primary/fallback route from the UI.

Supported without code changes:
- HTTPS GET or POST endpoints
- form-urlencoded or JSON POST bodies
- API key in request body, header, query string, Bearer token, or Basic auth password/token
- configurable recipient, message, sender, and API-key field names
- optional static request parameters and extra headers
- configurable provider message-ID response path (for example `0.message_id` or `data.id`)
- primary + fallback routing, retry limits, priority, and cost metadata

The actual API-key value is intentionally **not stored in the database/UI**. The provider form stores only the environment-variable name (for example `SEMAPHORE_API_KEY` or `MY_SMS_API_KEY`). Add that secret to the TEST/production server environment once per provider. After that, enabling/disabling the provider and switching the primary/fallback route is UI-only.

Providers that require OAuth token-exchange flows, request signing/HMAC, certificates, multipart payloads, or multi-step APIs still need a dedicated adapter. Do not put a secret value into Static params, Extra headers, API URL, or any database field.

### Semaphore preset

The migration `20260908133000_generic_sms_provider_adapter.sql` converts the existing Semaphore row to the Generic HTTP adapter with these mappings:
- POST + form-urlencoded
- API key location: body
- API key field: `apikey`
- recipient: `number`
- message: `message`
- sender: `sendername`
- provider message ID: `0.message_id`

This preserves the existing Semaphore integration while making the delivery path provider-agnostic.
