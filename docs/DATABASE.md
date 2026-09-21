# Database engineering guide

Core areas include businesses/memberships, branches/branch membership, services, queue sessions/tickets/events, queue configuration, terminals/devices, notifications, subscriptions and audit data.

Rules:

- RLS enabled on tenant-bearing tables unless there is a reviewed reason otherwise.
- SECURITY DEFINER functions set a controlled `search_path`.
- Authorization decisions use authenticated identity plus business/branch membership; never trust browser-supplied tenant ids alone.
- State transitions that must be atomic belong in PostgreSQL functions/RPC.
- Add indexes with query patterns and scale in mind; verify performance changes on TEST data.
- Migrations are immutable once applied remotely.
