# Round 11 lint cleanup fix

- Removed the unused `profileResult` query/destructure from Settings.
- Added an ESLint ignore for the obsolete `settings-unified-console.jsx` file so an old overlay copy cannot break lint.
- Added `CLEAN_INSTALL_ROUND11_FIX.ps1` to remove the stale JSX copy and generated Next/Playwright artifacts after extracting over an existing project.
- `settings-unified-console.tsx` remains the source of truth.
- No database migration is included in this patch.
