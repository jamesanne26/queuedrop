# QueueDrop TEST-to-PROD acceptance evidence (22 October 2026)

**Release decision: HOLD.** Never treat green CI as proof of provider/hardware acceptance. No Production mutation is authorized by this document.

## Verified
- TEST commit fd062167: six GitHub workflows green, Browser E2E 58 passed and 2 skipped.
- TEST PayMongo checkout and invoice SQL regression scripts succeeded, including four parallel independent rollback-safe invocations of each.
- TEST payment functions are SECURITY DEFINER, unavailable to anon/authenticated, with unique invoice reference index.
- TEST migration history contains 111 entries; repository contains 106 migration files. Six repository versions are not recorded under the same versions in TEST, while eleven TEST versions have no corresponding repository file. Do not mark migration parity as passed.

## Mandatory unresolved gates
1. **Webhook HTTP concurrency**: send multiple valid signed sandbox webhook POSTs for the **same** disposable TEST order/payment ID at once. Confirm all expected acknowledgments, exactly one payment row, one subscription extension, and conflict rejection. Independent SQL rollback fixtures are not equivalent.
2. **PayMongo sandbox**: complete actual sandbox hosted checkout, provider-generated signed callback, recurring invoice and renewal, verify DB reconciliation and subscription entitlement. No real sandbox transaction evidence recorded yet.
3. **Migration parity**: compare the effective SQL definitions and dependencies of TEST-only applied versions to the repository's 20261022 migration files; create canonical forward-only migration reconciliation. Never delete history rows or apply production migrations merely to make counts equal. Re-run migration replay and verify deployed schema.
4. **Restore**: restore a TEST snapshot to a *separate isolated database*, run integrity/tenant isolation/payment checks, record duration and RPO/RTO, then rehearse application rollback with a non-destructive additive schema. A green SQL transaction rollback is not a backup restore.
5. **Physical printer**: use PT-210 and Android Print Bridge with disconnected printer, cancelled ticket, lost acknowledgement, uncertain job, reprint and reconnection. Record physical output and one-ticket/one-stub outcome. CI simulation cannot certify paper.
6. **Browser skips**: inspect the two skipped tests and explicitly accept or eliminate them; no unexplained critical skips at release.
7. **Operations**: verify real SMS provider delivery, scheduler/heartbeat alerting, restore owner, support escalation and subscription expiration with a real disposable TEST tenant.

## Go/no-go
GO only when each gate has dated reproducible evidence and the owner authorizes a separate Production release. A test run must not touch Production.