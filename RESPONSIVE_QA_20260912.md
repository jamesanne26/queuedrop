# QueueDrop responsive QA hardening — 2026-09-12

This batch expands browser coverage for phone, tablet, and desktop layouts and protects the customer phone preview regression.

## Representative viewports

- Phone: 390 x 844
- Tablet portrait: 820 x 1180
- Desktop: 1440 x 900

## Automated coverage

`tests/e2e/regression/responsive-layout.spec.mjs` sweeps the main public/auth/legal routes plus the owner workspace routes at all three viewport sizes. Each sweep checks for application/browser errors, document-level horizontal overflow, and visible interactive controls clipped outside the viewport.

Scenario 6 also checks the kiosk/terminal view at all three sizes. Scenario 10 checks both the in-dashboard customer phone preview iframe and the direct QR/customer status page at all three sizes.

Run the focused responsive suite with:

```powershell
npm run test:responsive
```

Then run the full regression suite before committing:

```powershell
.\QueueDrop-Run-All-Tests.bat
```
