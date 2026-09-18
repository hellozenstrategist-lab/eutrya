# Eutrya desktop — Atelier 03

This replaces the active frontend composition, not just its colors. `web/index.html` now loads `css/atelier.css` and four small JavaScript modules under `web/ui/`. Previous frontend files remain in the repository for reference but are not loaded. The existing `web/backend.js` transport and `runtime/` implementation are unchanged.

## Structure

- `ui/icons.js`: local SVG icons and logo; no icon font or CDN dependency.
- `ui/components.js`: persistent desktop shell, editable HTML headers, reusable frames, portrait cards, and SVG graph components.
- `ui/views.js`: separate Dashboard, Swarm, Library, Memory, Tools, and Settings compositions.
- `ui/app.js`: delegated events, draft preservation, backend calls, dialogs, polling, and native window actions.
- `css/atelier.css`: one layout system with explicit wide, medium, and narrow compositions.

Photographic decorations reuse the existing generated `dashboard-hero.jpg`, `sidebar-botanical.jpg`, and five agent portraits. SVG viewboxes and CSS masks crop the botanical illustrations without using whole screenshots as controls. Text, inputs, statuses, graphs, and buttons remain live elements. Typography uses installed system fonts; no font files are distributed.

## Behavior

Swarm supports selectable SVG nodes, map/list views, bounded zoom, actual profile counts, and an agent inspector. Adding a sixth profile includes it in the network. Library supports search, grid/list views, editable profiles, and confirmed removal. Memory supports search, source filters, record selection, creation, and confirmed forgetting. Its graph represents actual source counts and category links, not inferred semantic relationships.

Tools reflects runtime profile assignments. The execution path is descriptive; requesting a tool opens an Admin chat draft rather than pretending to run a tool locally. Settings has distinct model, credential, permission, runtime, workspace, and interface cards. Configuration changes require an explicit confirmation before applying. Workspace switching remains a native-desktop action.

The shell survives page renders; titlebar event handlers are not repeatedly reinstalled. Minimize, maximize, close, and manual dragging call the native Tauri window API. The existing drag capability is retained. Tauri CSP additionally allows the documented IPC transport (`ipc:` and `http://ipc.localhost`).

The UI does not invent online agents, completed chats, memory totals, task progress, or CPU/disk percentages. Offline and demo states are explicit. The dashboard activity chart is derived from actual runtime events. Reduced motion and density are local interface preferences; they do not alter runtime permissions. Secrets are not persisted in browser storage.

## Verification in the build environment

- JavaScript syntax checks passed for all four active modules.
- `node --test desktop/tests/atelier.test.mjs`: 14 tests passed.
- Existing `runtime/tests/desktop-bridge.test.mjs`: 1 integration test passed.
- Browser layout matrix: all six views at 390, 560, 700, 820, 960, 1100, 1280, 1536, 1920, and 2560 CSS pixels wide: 60 checks, no detected horizontal page overflow or out-of-bounds frames in the tested state.
- Browser interaction checks: 16 passed, including profile persistence, sixth-profile creation/removal, memory CRUD, backend chat dispatch, settings persistence, draft retention, and truthful offline rendering. No browser JavaScript errors occurred in these checks.

Browser screenshots were captured at 1536x1000 and 820x1000 using the actual production CSS/JavaScript and original image bytes with an explicitly enabled local demo backend. Container browser policy prevented direct localhost/file navigation, so the test harness inlined the frontend and relayed API calls through the test driver to the running Node backend. The screenshots are browser renders, not generated mockups. The native window API was stubbed for its interaction test.

This is not a native WebKitGTK/Wayland validation, a paid live-model test, or a guarantee for every possible content/state/zoom combination. Rust/Cargo were not available in this build environment. Native minimum width remains 700 pixels. Narrow views intentionally scroll vertically rather than shrinking an entire page to illegible dimensions.

## Build on Omarchy

From the repository root:

```sh
node --test desktop/tests/atelier.test.mjs
cd desktop
cargo tauri build --no-bundle
```

Close the older app instance before launching the rebuilt executable at `desktop/src-tauri/target/release/eutrya-desktop` (path relative to the repository root). `--no-bundle` avoids the previously observed linuxdeploy/AppImage packaging failure.

## Keyboard controls

Ctrl/Cmd+1 through 6 opens the six pages. Ctrl/Cmd+K focuses the current search or composer. Enter sends a chat message; Shift+Enter inserts a newline. Graph nodes and action buttons are keyboard-focusable. Clear view hides the current conversation locally without deleting stored messages.
