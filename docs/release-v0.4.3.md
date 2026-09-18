# Eutrya v0.4.3 — Desktop Chat Deduplication (Public Alpha)

This patch fixes a transient duplicate-message bug in the Studio chat UI.

## Fixed

- A newly sent user message is still rendered optimistically for instant feedback.
- As soon as the backend persists that same newly sent message into the shared workspace, the optimistic copy is removed.
- The UI no longer waits for the agent response to finish before removing the duplicate.
- A timestamp guard prevents an older identical message from suppressing a genuinely new resend.

This changes presentation only; it does not alter message delivery, model execution, tool permissions, or swarm routing.
