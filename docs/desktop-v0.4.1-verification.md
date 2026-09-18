# Desktop v0.4.1 verification

Date: September 18, 2026. Scope: the actual Studio frontend and human-operated Hunt review metadata API.

## Automated regression checks

The integrated source passed **249 tests**, with **0 failures, 0 skipped**, and **70 JavaScript modules** passed syntax checking in the preparation run. The raw TAP output is preserved in the `desktop-review-source` GitHub Actions artifact for run `35379201168`. That run's final commit step failed while deleting its temporary preparation script; the script-cleanup failure was subsequently corrected. The passing test result is separate from that workflow failure. Pull request #5 must pass the ordinary protected-branch CI before merge.

The new regression coverage includes active entry-point loading, security-role defaults, the semantic-code tool catalog, empty/offline board behavior, filters, escaping, unknown statuses, missing dependencies, manual move restrictions, metadata validation, optimistic edit conflicts, pause semantics, and incomplete worker outcomes.

## Browser fixture checks

The real Studio scripts and styles were loaded into headless Chromium with an explicitly offline, in-memory backend fixture. The environment's browser policy blocked navigation to a localhost HTTP URL; the browser checks therefore do **not** claim a full HTTP-connected browser end-to-end run.

Checks passed:

- All seven screens render: Dashboard, Swarm, Hunts, Library, Memory, Tools, Settings.
- Paused-board and parked-card forms submit correctly against the fixture.
- Human notes survive a subsequent read and polling.
- Blocked-state changes and board pause/resume require confirmation.
- Search filtering, card dialogs, and JSON export work.
- The 820-pixel-wide layout does not overflow the document; the Kanban intentionally scrolls horizontally.
- No JavaScript page errors were observed.
- No model calls, target requests, or execution attempts were made.

Screenshots of the empty board, populated fixture board, card dialog, and narrow layout were visually inspected during development. They are test fixtures, not evidence of a real hunt.

## Actual local HTTP bridge checks

Separately from the browser fixture, `desktop/server.mjs --demo` was run against a disposable local configuration/workspace. Requests to the loopback bridge verified:

- Missing desktop request authorization is rejected with HTTP 403.
- Board creation returns a paused board.
- Manual card creation returns a parked card.
- A human note is stored separately from worker/reviewer results.
- An outdated edit token returns HTTP 409 rather than overwriting the latest record.

## Limits

These results are not a security audit, live Jev evaluation, a vulnerability-discovery benchmark, or a successful packaged Tauri binary build. Desktop packaging remains experimental and Linux-first. Tests of the UI used fixture content; no third-party security target was contacted.
