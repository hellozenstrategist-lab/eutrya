# Eutrya v0.4.9 — Scrollable CLI Conversation/Event Feed

This release adds scrollback navigation to the interactive CLI event stream.

## Controls

```text
PageUp
PageDown
/feed
/feed up
/feed down
/feed top
/feed bottom
/scroll up
/scroll down
```

The feed keeps a bounded in-memory history of rendered conversation and runtime events. While browsing older pages, new live events continue to accumulate without forcing the viewport back to the bottom. Returning to `/feed bottom` resumes live rendering.

Scrollback is presentation state only. It does not change durable session traces, Jev/model context, compaction state, or permissions.
