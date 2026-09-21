# Deployment and release

## Environments

- DEV: local developer environment and local Supabase where practical.
- TEST: isolated cloud deployment/database for integration and acceptance testing.
- PROD: isolated production environment and data.

Do not share service-role keys or destructive test credentials between TEST and PROD.

## Release flow

1. PR passes quality/build checks.
2. Merge to `test` and deploy TEST.
3. Confirm migration state; apply pending migrations to TEST.
4. Run integration checks and post-deploy smoke.
5. Run targeted/full browser regression depending on risk.
6. Approve release.
7. Promote reviewed commit to production and apply corresponding PROD migrations.
8. Perform production smoke without destructive test data.

## Migration safety

Before database push: `npx supabase migration list --linked`. Review exactly which local migration is pending. After push, list again and require Local == Remote. Never repair migration history casually; investigate drift first.

## Rollback

Application rollback can redeploy the previous known-good commit when compatible with the current schema. Database migrations are forward-only by default; destructive migrations require an explicit recovery/data plan before approval.
