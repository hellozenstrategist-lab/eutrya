# Eutrya Native 0.4.0 — unified verification record

Build date: **September 18, 2026**. Clean CI environment: **GitHub Actions, Ubuntu, Node.js 22**.

## Current results

| Check | Result | Evidence |
| --- | --- | --- |
| Full test suite | **227 passed, 0 failed, 0 skipped** | GitHub Actions integration run |
| JavaScript syntax | **65 modules passed** | `npm run check` |
| Shell installer syntax | **Passed** | `bash -n scripts/*.sh` |
| Tauri manifest | **Passed** | `cargo metadata --no-deps` |
| Tauri config JSON | **Passed** | JSON parse in CI |
| Hunt-board persistence/routing | **Passed** | `tests/hunt-board.test.mjs` |
| Desktop bridge | **Passed** | `tests/desktop-bridge.test.mjs` |
| Security swarm | **Passed** | existing swarm regression suite |
| Jev research lane | **Passed** | existing research regression suite |
| Live paid inference | **Not part of CI** | no claim of live-provider quality certification |

## Unified runtime acceptance checks

The CLI and desktop now share one authoritative backend source tree. The desktop bridge imports the current root `NativeSwarm`, security-agent profiles, shared workspace, Jev-routed hunt board, memory, settings, and approval gates. No stale duplicated `runtime/` backend is merged into source control.

Development uses the repository root directly. Packaged desktop resources mirror the current root runtime into the application resource namespace, while the Omarchy installer installs a local runtime snapshot under `~/.local/share/eutrya/runtime`.

The CLI command remains `eutrya`. The desktop command is `eutrya-desktop`, with `eutrya-cli` available as an installed CLI snapshot.

## What these results do not establish

The suite validates controller wiring, persistence, availability filtering, desktop bridge integration, action validation, shell/manifests, and prior runtime behavior. It does not establish live-model judgment quality, vulnerability-finding rates, bounty eligibility, production reliability, Tauri packaging on every Linux distribution, or formal security correctness.
