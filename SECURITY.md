# Security policy

QueueDrop is a multi-tenant system. Tenant isolation and authorization are release-blocking concerns.

- Authorization must not rely on hidden UI alone; enforce it in server actions/API/RPC/RLS.
- Service-role keys are server-only and must never be exposed to browser bundles.
- Storage paths for tenant assets must be business-scoped and validated.
- Never run destructive automation against production.
- Security-impacting migrations require TEST verification before PROD.
- Report suspected cross-tenant access, credential exposure, or authorization bypass immediately and stop promotion until investigated.
