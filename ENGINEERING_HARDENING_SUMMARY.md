# QueueDrop engineering hardening package

This package keeps the latest working QueueDrop features and adds the first team-ready engineering foundation without a broad rewrite.

Implemented now:

- Same-repository testing architecture (`tests/unit`, `tests/integration`, `tests/e2e`, `tests/visual`).
- Dependency-free Node unit-test runner and 33 initial unit tests.
- TEST Supabase integration-contract and optional RLS isolation checks.
- Post-deployment smoke checks.
- CI quality, TEST and nightly GitHub Actions workflows.
- Reusable access, queue position, terminal appearance and phone-normalization domain helpers used by production code.
- Architecture/development/testing/deployment/database/authorization docs and ADRs.
- PR template, contributor guide, repository settings guide, Dependabot and secret scan.
- Technical debt register so large-file refactors happen incrementally behind tests.

Not force-migrated in this package:

- The existing standalone Playwright regression runner. Its working scenarios should be migrated gradually into `tests/e2e/regression` rather than rewritten or discarded.
- Visual screenshot automation. The in-repo target structure and viewport priorities are documented; add it as Playwright migration proceeds.
- GitHub branch-protection settings. They require repository-admin configuration and are documented in `docs/REPOSITORY_SETTINGS.md`.

Local verification performed before packaging: 33/33 unit tests passed, secret scan passed, integration/smoke suites load correctly and skip safely when TEST credentials/URL are absent, all 99 TypeScript/TSX source files passed syntax transpilation, and all GitHub workflow YAML parsed successfully. A full Next.js build must still be run in the user's normal project environment because this packaging environment does not contain the project's installed `node_modules`.

## 2026-09-07 test-environment hardening follow-up

The automated test runner now loads local environment files automatically for non-unit suites, with dedicated TEST values taking precedence. Supabase integration tests no longer fall back to the normal application Supabase project. Local integration runs may skip when TEST infrastructure is intentionally absent, while `test:integration:required` turns missing TEST configuration into a failure for CI/release gates. Smoke tests have the same required-mode behavior.

GitHub workflow files, Dependabot configuration, and a PR template are included in the repository package. `supabase/.temp` is intentionally excluded because it is local CLI state and should not be distributed or committed.
