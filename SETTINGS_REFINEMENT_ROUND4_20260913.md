# Settings refinement round 4 — 2026-09-13

- Removed Account from the main sidebar footer; Settings and Sign out remain stacked at the bottom.
- Users & Access is now expandable/collapsible.
- Removed the redundant `Service list` navigation child. Services opens directly from the main Settings hierarchy.
- Add Branch now uses an optional `Duplicate settings from` branch dropdown instead of a checkbox tied to the currently selected branch.
- Branch duplication remains tenant-scoped and copies services, operating hours, queue rules, notifications and appearance; users and terminals are not copied.
- Save Changes and Delete branch controls no longer sit inside separate visual boxes and now use matching button dimensions.
- Branch navigation optimistically selects the branch and prefetches branch Settings routes (bounded to the current tenant's first 20 branches, plus pointer/focus prefetch) to reduce perceived switching latency without preloading other clients' data.
- Updated owner navigation E2E expectations to match the removal of Account from the sidebar.
