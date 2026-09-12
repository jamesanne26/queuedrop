# Responsive QA follow-up — 2026-09-12

Fixed two issues exposed by `npm run test:responsive`:

- Kiosk phone view had a 5 px horizontal overflow because the mobile button/service widths used `92vw` inside a padded card. They now use the parent content width (`width: 100%`) with a 430 px max width.
- Privacy desktop view inherited `.dashboard-section { display:flex }`, causing every heading/paragraph to become a horizontal flex item. Legal pages now force the legal article to block flow, which also protects Terms and Refunds.

The existing responsive suite remains the regression coverage for phone (390x844), tablet (820x1180), and desktop (1440x900).
