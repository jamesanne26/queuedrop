# Authorization model

System roles: owner, admin, manager, staff. Owner/admin normally have business-wide operational management. Manager/staff capabilities are narrowed through permission flags and branch assignments.

Security principle: UI visibility improves UX but is not authorization. Sensitive actions require enforcement in server actions/API routes and preferably the database boundary via RPC/RLS when persisted state is involved.

Tenant tests should specifically cover: user from Business A cannot read/write Business B; staff cannot operate unassigned branches; inactive membership is rejected; owner-only/admin-only actions remain protected even when invoked directly.
