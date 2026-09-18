# Eutrya v0.4.4 — Substantive Completion Responses (Public Alpha)

This patch removes bare internal completion labels from user-facing chat.

## Fixed

- `start hunting now`, bug-bounty, Immunefi, Bugcrowd, HackerOne, pentest, and similar security prompts bypass the small tool-free reply lane.
- `Completed`, `Done`, `Finished`, and equivalent generic labels are not accepted as substantive final answers.
- Direct chat, delegated resident work, and temporary subagents use the same status-aware final-response resolver.
- If a run pauses, needs input, errors, or ends without a narrative answer, the user sees the actual reason/status instead of a false completion.
- Hunt routing without a narrative points the user to the Hunt board/results.
- Delegated tasks are only marked completed after a substantive ANSWERED/VERIFIED result.

No security target traffic is introduced by this change; it changes dispatch classification and response/status handling.
