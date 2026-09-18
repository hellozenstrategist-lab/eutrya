# Eutrya v0.4.8 — Session-Only YOLO Execution Mode (Public Alpha)

This release adds an explicit interactive CLI mode for skipping repeated local command approvals.

## New command

```text
/yolo
/yolo on
/yolo off
```

When enabled, Eutrya auto-approves local `run` and `shell` actions for the current CLI process. If execution tools were disabled, YOLO temporarily exposes them and restores the previous `allowExec` state when switched off.

YOLO mode is not persisted across restarts and does not auto-approve workspace file writes, memories, MCP operations, credentials, or other unrelated actions.


## Live operator bar

The CLI now remains interactive while a turn is running.

```text
/stop
/steer change direction
/queue
/queue clear
```

Plain text entered while the current turn is active is queued and runs automatically afterward. This keeps the terminal usable as an operator console instead of freezing input until the model returns.
