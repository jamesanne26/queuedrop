# QueueDrop SMS opt-in recipient fix

This patch fixes the queue-position SMS enqueue path to use `tickets.sms_phone`, which is the explicit stub-level SMS opt-in recipient. It intentionally does not fall back to customer profile/contact phone fields.

It also makes saving an enabled SMS threshold immediately evaluate already-waiting opted-in stubs, while the existing notification uniqueness constraint keeps the operation idempotent.

A convenience command is included:

```powershell
npm run sms:dispatch
```

The command reads the dispatcher secret without printing it and posts to the local dispatcher endpoint.
