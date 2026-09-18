# Eutrya v0.4.5 — Agent Message Boundary Hardening (Public Alpha)

This patch hardens user-facing chat at the persistence boundary.

## Fixed

- No agent-to-user backend path can persist a bare `Completed`, `Done`, `Finished`, or equivalent generic success label.
- If an internal path still emits such a value, Eutrya stores an explicit diagnostic instead of pretending the task completed.
- Substantive messages such as `Completed scope mapping; three cards are ready.` remain unchanged.
- User-authored text is never rewritten by this guard.
- Desktop health now exposes both `bridgeVersion` and the active `runtimeRoot` to make stale installed runtime copies easy to identify.

This is defense in depth on top of the v0.4.4 dispatch/final-response fixes.
