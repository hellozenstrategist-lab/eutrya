# Eutrya v0.4.1 — Desktop Review Workspace (Public Alpha)

The desktop now exposes the current shared hunt ledger through the actual Studio entry point.

## Added

- Hunts navigation tab and seven-column Kanban: Intake, Ready, Active, Review, Blocked, Done, Parked.
- Board selector, card search, agent filter, real counts and explicit offline/empty states.
- Current resident assignments and recorded Jev routing decisions. Choice weights are not presented as correctness or safety scores.
- Card dialogs with worker results, independent reviews, blockers, dependencies and human notes.
- Manual review-board creation. New boards start paused and new cards start parked.
- Conflict-safe metadata edits; stale records return a conflict instead of silently overwriting newer work.
- Confirmed drag-to-park/block actions; runtime-controlled stages cannot be marked complete by dragging.
- Board-state pause/resume and local JSON exports. Resuming a board does not launch work.
- Current security-role descriptions and portraits, semantic-code tool groups, hunt records in Memory, and board counts on Dashboard.
- Backend-derived version labels rather than a stale hardcoded Studio version.

## Safety and limits

There is no desktop router-launch or automatic target-testing control in this update. Board organization and review are separate from execution. The existing CLI remains a separate interface; no new external testing capability is added here.

Pausing stops future dispatch and requests cancellation of the board's active residents. Completed effects cannot be undone, and provider-side work may continue after cancellation. Incomplete worker runs are not treated as successful card completion.

This is an alpha UI, not an independent security audit. The Tauri packaged desktop remains experimental and Linux-first. Rebuild the desktop after updating source: restarting its bridge cannot replace a previously bundled frontend.
