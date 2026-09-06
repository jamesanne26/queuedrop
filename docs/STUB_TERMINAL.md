# QueueDrop Stub Terminal + Print Bridge

QueueDrop is stub-first. Customers do not enter a name or phone number to join.

## Recommended runtime flow
1. Android opens `/kiosk/<device-token>` fullscreen. Dashboard users can launch it from the mobile side navigation using **Get Stub**.
2. Customer taps **GET STUB**.
3. `POST /api/kiosk/<device-token>/ticket` atomically creates the queue ticket **and one durable `print_jobs` row**.
4. The QueueDrop Print Bridge APK polls `GET /api/print-bridge/<device-token>/jobs` and atomically claims the oldest eligible job.
5. The APK renders text + QR and prints through the connected ESC/POS thermal printer, preferably USB.
6. The APK acknowledges success/failure with `PATCH /api/print-bridge/<device-token>/jobs`.
7. Failed jobs retry with backoff; the same ticket never creates a second print job.
8. The printed QR contains `/q/status/<session-token>`; mobile number remains optional for SMS alerts.

The print payload includes `ticketId`, `displayNumber`, business/branch/service names, position, `sessionToken`, and footer text. The API route adds the absolute QR URL before returning the ticket to the kiosk UI. The APK should use the current QueueDrop origin when converting `sessionToken` into the status QR URL, or use the kiosk response/status URL when running in the legacy WebView bridge.

## Legacy native bridge compatibility
Older QueueDrop Android wrappers may still expose:

```text
QueueDropPrinter.printStub(jsonPayload)
```

The web kiosk keeps this as a transition fallback. After it prints, the corresponding durable print job is marked complete so a future Print Bridge does not print the same ticket again.

## Protected kiosk exit
When kiosk mode is launched from the authenticated mobile dashboard (`?from=dashboard`), a **Back** button appears at the top. Returning to the dashboard requires the business-level Get Stub exit PIN configured in **Dashboard → Settings → Kiosk security**.

The PIN is never stored in plaintext. PostgreSQL `pgcrypto` bcrypt hashing is used. Five incorrect attempts temporarily lock that terminal for one minute.

## Security
- Treat `device_token` and printed status tokens as bearer secrets.
- A terminal is bound to one branch and one service.
- Print Bridge endpoints operate only on jobs assigned to the matching active terminal token.
- Never embed Supabase service-role credentials in the APK.
- Disable/remove lost terminals from Dashboard → Terminals.
