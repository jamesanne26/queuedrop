## Summary
Describe the user-visible or engineering change.

## Risk
- [ ] Queue lifecycle
- [ ] Authentication / authorization / RLS
- [ ] Database migration
- [ ] Public customer flow
- [ ] Terminal / print bridge
- [ ] Billing / webhook
- [ ] UI / responsive-only

## Verification
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test:unit`
- [ ] `npm run build`
- [ ] Integration tests run when TEST credentials are available
- [ ] Relevant smoke/E2E scenario run for behavior changes

## Database
Migration added/changed: Yes / No
Rollback or forward-fix notes:
