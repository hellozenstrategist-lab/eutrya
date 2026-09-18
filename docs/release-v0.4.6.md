# Eutrya v0.4.6 — CLI Protected-Context Overflow Fix (Public Alpha)

This patch fixes long-lived CLI sessions that could fail before a new task started because prior task history was injected into the protected Jev packet without a bound.

## Fixed

- `previousTasks` is bounded in durable runtime state.
- Active Jev packets receive a deterministic recent-task handoff window instead of the full historical list.
- The handoff window scales with the current packet budget.
- Full historical evidence remains available through durable trace/chat/session history rather than being injected into every prompt.
- Regression coverage verifies a fresh task can run after 100 oversized legacy prior-task entries at a 12k prompt budget.

The fail-closed protected-context check remains intact; this patch removes the unbounded historical input that was tripping it.
