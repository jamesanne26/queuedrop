# ADR 002: Business-scoped multi-tenancy with RLS

Status: accepted.

`businesses` is the tenant boundary. Membership and branch assignment determine access. RLS/RPC are authoritative for persisted multi-tenant access; frontend route visibility is not treated as security.
