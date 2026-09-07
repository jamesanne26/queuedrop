# ADR 003: Service-specific queue positions

Status: accepted.

Waiting positions are independent per service. Shared pure position calculation lives in `lib/queue/positions.ts` for UI consistency; authoritative transitions remain database controlled.
