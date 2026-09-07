# ADR 004: Independent E2E scenario data

Status: accepted.

Each browser scenario creates uniquely identified prerequisites and cleans only its own records. Scenarios never depend on execution order. This prevents domino failures and supports future parallel execution.
