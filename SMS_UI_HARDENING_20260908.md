# SMS System UI hardening — 2026-09-08

- Removed editable server credential/environment-key fields from the System SMS UI.
- Cloud-provider credentials remain server-only. New providers derive a credential reference from provider code; Semaphore keeps `SEMAPHORE_API_KEY` compatibility.
- Compact provider cards replace the oversized always-visible configuration layout.
- Provider HTTP mapping is grouped under an Advanced section and clearly labeled as non-secret configuration.
- Add Provider is now a modal window.
- SMS notifications and delivery audit logs are now modal windows instead of long inline tables.
- Notification and delivery-attempt logs use server-side pagination (15 rows/page) with exact total counts.
- Android gateway devices moved to a modal window to keep the main page focused.
- Added automated coverage for server-only provider credential-key derivation.
- SMS automated suite: 13/13 passing in the build workspace.
