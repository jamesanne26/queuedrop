# CI service assignment flakiness fix — 2026-09-15

GitHub Actions on commit b5a3c06 reported 3 flaky scenarios (4, 6, 8), all at the newly-created catalog-service assignment boundary.

The CI artifacts showed either a missing service option in the branch picker or `Service was not found in the library.` immediately after creation. Local full regression had already passed 47/47.

The E2E fixture now re-renders for the exact new service, refreshes the owner session once if needed, and retries only the exact transient assignment failure once. No production behavior or database schema changed.
