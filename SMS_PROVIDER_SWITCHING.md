# QueueDrop SMS provider switching

QueueDrop's queue and notification logic is provider-independent. Cloud SMS providers are delivery methods stored in `sms_delivery_methods`; `sms_routing_rules` selects the primary and fallback methods.

## Switching providers

1. Open **System > SMS**.
2. Add or edit a Cloud provider.
3. Enter the provider's HTTPS API URL and field/auth mappings from its API documentation.
4. Set **Secret environment key** to the server environment variable that contains the provider API key/token. Never paste the actual secret into QueueDrop's database fields.
5. Put the actual secret in the TEST deployment/server environment.
6. Enable the provider.
7. In **Philippines > Default route**, choose it as Primary method and optionally configure fallbacks.
8. Keep `SMS_DRY_RUN=true` until the route is verified, then perform one controlled live-delivery test.

## Generic HTTP compatibility

No code change is needed when the provider can send an SMS with one HTTPS GET/POST request and supports one of these auth patterns: body field, header, query parameter, Bearer token, or Basic auth. Form-urlencoded and JSON request bodies are supported.

A dedicated code adapter is still required for providers with OAuth token exchange, HMAC/request signing, client certificates, multipart upload, or another multi-step protocol.

## Security

The DB stores only non-secret adapter configuration and the *name* of the environment variable containing the secret. Provider endpoints are restricted to HTTPS and local/private addresses are rejected to reduce SSRF risk.
