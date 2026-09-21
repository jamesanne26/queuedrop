# End-to-end tests

QueueDrop's browser E2E suite should live here long term. The existing external Playwright runner can continue to be used while scenarios are migrated incrementally so working coverage is not disrupted.

Rules for every scenario:

1. Generate a unique run id.
2. Prepare only the data the scenario needs.
3. Never depend on a previous scenario.
4. Exercise the UI as a real role.
5. Assert both visible behavior and critical persisted state.
6. Clean up only data owned by that run id.
7. Capture screenshot/trace/video on failure.

`smoke/` is reserved for small post-deployment gates. `regression/` is for the complete pre-production/nightly browser suite. `fixtures/`, `helpers/`, and `cleanup/` are shared support code.
