# QueueDrop Settings workspace vendor fix — 2026-09-13

## Scope
- Rebuilt the Settings hierarchy navigation styling as an isolated CSS Module so it cannot silently collapse into unstyled/plain text when global CSS ordering changes.
- Kept all Settings destinations inside `/dashboard/settings` and switched sections client-side.
- Added hierarchy groups for Branches, Services, Users & Access, Business, Billing and Account.
- Account card and Sign out are pinned to the bottom of the Settings hierarchy on desktop.
- Added responsive desktop/tablet/mobile hierarchy behavior.
- Added a scoped inner-surface visual layer so legacy management widgets rendered inside Settings inherit the new Settings visual language rather than looking like separate legacy pages.
- Existing server actions and data behavior are preserved.

## Navigation behavior
Settings view buttons use `data-settings-target` and update the URL with `history.replaceState`; they do not navigate to legacy management pages. Branch changes use a Settings-only router replace.

## Verification in this package
- CSS parsed successfully with PostCSS before packaging.
- Updated TSX files were syntax-checked with TypeScript transpilation.
- Full project typecheck/E2E could not be executed in the packaging sandbox because project dependencies were not available there; run the included project locally where `npm install` is already healthy.
