# SMS route persistence hardening

- Validates the selected primary provider before saving a country route.
- Rejects disabled or wrong-country providers and invalid fallback IDs.
- Verifies the database actually persisted the selected primary method.
- Shows the currently persisted primary provider in System > SMS.
- Prevents manual routing from silently falling back to an arbitrary enabled provider/gateway when the configured route is empty or invalid.
- Adds automated routing tests for save validation, provider ordering, cloud-only filtering, and no-silent-fallback behavior.
