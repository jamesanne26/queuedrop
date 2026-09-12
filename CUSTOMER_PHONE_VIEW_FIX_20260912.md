# Customer phone view / QR status responsive fix — 2026-09-12

## Root cause
The production security hardening set `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` globally. The Queue workspace intentionally embeds the same-origin `/q/status/[token]` customer page inside the phone preview iframe, so browsers correctly blocked it and displayed a blank phone screen.

## Fix
- Changed `X-Frame-Options` to `SAMEORIGIN`.
- Changed CSP `frame-ancestors` to `'self'`.
- Cross-origin framing remains blocked.
- Improved preview modal sizing with dynamic viewport units for phone/tablet layouts.
- Kept the actual customer QR page on a single page scroll (no nested customer queue scroller).
- Extended Scenario 10 E2E coverage to render the customer page inside the live-queue iframe and verify phone (390px), tablet (820px), and desktop (1440px) widths without horizontal overflow.
