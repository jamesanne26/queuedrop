# QueueDrop SMS Queue Position Alerts

## Behavior

When SMS is enabled for a branch and **Start texting when customer reaches position** is set to `3`, QueueDrop creates one SMS for each position transition inside the threshold:

- Customer reaches 3rd -> SMS
- Customer reaches 2nd -> SMS
- Customer reaches 1st -> SMS

The database unique index prevents the same ticket from receiving the same queue-position SMS twice.

Queue position is service-specific, matching the existing QueueDrop queue engine.

## Provider

This implementation uses Semaphore for Philippine SMS delivery.

Add these environment variables to the environment that runs the Next.js server (for example Vercel):

```env
SEMAPHORE_API_KEY=your_semaphore_api_key
SEMAPHORE_SENDER_NAME=your_approved_sender_name
```

`SEMAPHORE_SENDER_NAME` is optional in code. Semaphore can use the account default sender name when it is omitted, provided the account has one configured.

The existing Supabase admin environment variable is also required by QueueDrop's server-side SMS dispatcher:

```env
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

or the project's existing `SUPABASE_SECRET_KEY` fallback.

## Database migration

Apply migration:

`supabase/migrations/20260831033000_sms_position_threshold_and_delivery.sql`

Then deploy the Next.js application.

## Files added/updated

- `lib/notifications/sms.ts` - sends pending SMS jobs through Semaphore and prevents concurrent duplicate sends.
- `supabase/migrations/20260831033000_sms_position_threshold_and_delivery.sql` - SMS threshold settings and queue-position outbox logic.
- `app/dashboard/settings/page.tsx` - client branch SMS controls.
- `app/dashboard/settings/actions.ts` - saves SMS threshold settings.
- Queue mutation server actions - dispatch pending SMS after successful queue changes.

## Reliability behavior

The queue operation remains successful even when Semaphore is unavailable. SMS errors are recorded in the notification payload and status; QueueDrop does not block Call Next / queue operations because of an external SMS failure.
