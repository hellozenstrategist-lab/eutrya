# Eutrya Desktop — v0.4.1 public alpha

The Tauri desktop uses the same root NativeSwarm backend as the CLI. The active browser entry point is `desktop/web/index.html`, which loads `ui/components.js`, `ui/model.js`, `hunts.js`, `ui/views.js`, and `ui/studio.js`. The older top-level `app.js` and `core.js` are not loaded by this entry point.

## Screens

Dashboard, Swarm, Hunts, Library, Memory, Tools, and Settings.

Hunts displays the shared Kanban ledger, live assignments, recorded routing history, scope and rules, worker results, independent reviews, dependencies, blockers, and human notes. New manual boards are paused; new cards are parked. Board creation and status edits do not initiate testing. The desktop does not provide a router-launch control.

A card's runtime status is distinct from a human note. Only unassigned inactive cards can be parked or marked blocked. Active, review, and done stages cannot be manufactured through a UI edit. Dragging to Parked or Blocked opens a confirmation dialog; the same actions are available using keyboard-accessible buttons. Notes and metadata are conflict-checked against the current backend record.

Pause stops future dispatch and requests cancellation of this board's active workers. Resume changes board state only and does not start work. Past side effects cannot be undone. JSON export is local and contains the selected board's recorded data; review the file before sharing it.

## Development

With Node.js 22+, Rust/Cargo and the platform's Tauri prerequisites installed:

```bash
npm ci
npm run desktop:dev
```

The desktop bridge is `desktop/server.mjs`; human-operated metadata validation is isolated in `desktop/review-board.mjs`. Both are included in the Tauri runtime resources and Omarchy runtime snapshot.

## Update an installed desktop

Close Eutrya before rebuilding:

```bash
git pull --ff-only origin main
npm ci
npm run install:omarchy
```

Then launch `eutrya-desktop`. `eutrya` remains the CLI. Pulling source and relinking the CLI does not replace the frontend already embedded in a desktop binary. `/Reload` only reloads a runtime, not bundled interface assets.

## Verification scope

The regression suite covers local bridge behavior, board metadata validation, display logic, escaping, stale edits, and the actual Studio entry point. A passing JavaScript check or bridge test does not establish a successful Tauri binary build or cross-platform packaging. No live model calls or external-target tests are required for these checks.
