# QueueDrop Settings approved UI rebuild — 2026-09-13

Rebuilt Settings to match the approved hierarchy/master-detail mockup.

- Settings stays in `/dashboard/settings` for all inner navigation.
- Left hierarchy contains Branches, branch subsections, Services, Users & Access, Business, Billing, Account and Sign out.
- Selected branch has a branch summary header and local section tabs.
- Branch subsections switch instantly client-side; branch changes refresh only the selected branch data.
- General, Queue Settings, Notifications, Operating Hours and Appearance now render as separate views instead of one long legacy configuration screen.
- Queue-setting saves return to the subsection they were saved from.
- No legacy Branches/Services/Team/Terminals navigation links are used by the Settings console.
- Responsive behavior retained for desktop/tablet/mobile.

Validation in the sandbox: TS/TSX syntax transpilation passed for the changed Settings files and CSS braces are balanced. Full repository typecheck could not be completed in the sandbox because the extracted `node_modules` tree is incomplete (missing type packages); run `npm install` + `npm run typecheck` in the normal project workspace.
