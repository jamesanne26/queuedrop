# QueueDrop flaky E2E stabilization — 2026-09-14

## Fixed scenarios
- Scenario 3: branch create/edit/status/delete — dedicated 90s lifecycle budget.
- Scenario 4: service library create/assign/edit/delete — dedicated 90s lifecycle budget.
- Scenario 10: responsive customer status + SMS persistence — dedicated 120s budget because it intentionally exercises multiple viewports and an iframe route.
- Scenario 12: queue lifecycle to reports/CSV — dedicated 90s budget plus deterministic synchronization before Call next.

## Fixture isolation fix
`cleanupOwnedBranch()` now captures business-service catalog mappings before branch deletion, deletes only orphaned test-owned (`E2E ` prefix) business services, and repairs orphaned E2E catalog rows left by older interrupted runs. This prevents the service library from growing on every automation run and progressively slowing Settings tests.

## Scenario 12 synchronization
The reports scenario now waits for:
1. the test-stub success banner,
2. durable ticket persistence,
3. the waiting card to render,
4. Get test stub to return to enabled,
5. Call next to be enabled,
6. the DB status to become `called`, and
7. the pending UI to render the ticket.

This avoids racing the inline stub server action/realtime reconciliation before the queue transition assertion.

## Local validation performed in this workspace
- `node --check tests/e2e/helpers/admin-db.mjs` — PASS
- `node --check tests/e2e/regression/owner-branch-service-lifecycle.spec.mjs` — PASS
- `node --check tests/e2e/regression/owner-terminal-queue.spec.mjs` — PASS
- `node --check tests/e2e/regression/owner-settings-reports.spec.mjs` — PASS

The sandbox dependency install (`npm ci`) stalled, so lint/typecheck/Playwright runtime execution could not be completed here. Run the normal QueueDrop test runner on the development PC for runtime verification.
