# QueueDrop Settings Hierarchy UI v2 — 2026-09-13

Redesigned `/dashboard/settings` to follow the product hierarchy instead of a tile dashboard.

- Desktop: persistent hierarchical settings navigation on the left, selected-branch detail workspace on the right.
- Tablet: compact hierarchy above/alongside branch detail depending on width.
- Mobile: collapsible hierarchy followed by a single-column settings workspace; no horizontal page scrolling intended.
- Branch hierarchy: General, Services, Branch Users, Operating Hours, Queue Settings, Notifications, Appearance, Terminals.
- Business hierarchy: Services, Users & Access, Business, Billing & Subscription.
- Existing server actions, queue settings inputs, notification rules, operating hours, branch appearance, branch switching, and save-review flow are preserved.
- Existing navigation labels required by E2E (`Branches`, `Services`, `Users & Access`, `Branch terminals`) are preserved.
