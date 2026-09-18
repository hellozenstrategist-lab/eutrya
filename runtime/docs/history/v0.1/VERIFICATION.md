# Eutrya Native 0.1.0 — verification record

Build date: **September 17, 2026, America/Phoenix**. Environment: **Linux, Node.js v22.16.0**.

## Actual results

| Check | Result | Evidence |
| --- | --- | --- |
| Offline regression and provider-contract tests | **94 passed; 0 failed; 0 skipped** | `test-results.tap` |
| JavaScript syntax checks | **21 modules passed** | `npm run check` |
| Actual interactive pseudo-terminal | **Passed**: task, VERIFIED, status, compaction, clean exit | `repl-transcript.txt` |
| Switchboard seeds 1–20 | **20/20 independently verified in offline fixture mode** | `seeded-fixtures.json` |
| Installed AI SDK execution | **Not performed** | Dependency installation was blocked by DNS |
| Live Jev or live text-model inference | **Not performed** | No live API key supplied; no paid model calls made |

The JavaScript build has runtime tests and syntax checks, not a TypeScript typecheck. `npm test` and the demo intentionally work without installing any external dependencies.

## What the tests cover

The tests exercise mandatory evaluator consultation, evaluator influence over candidate order, invalid and stale execution tickets, forged/replayed tickets, malformed model output, failed evaluations, bounded retries, timeouts, stop and steering, persistent request budgets, independent puzzle verification, context compaction, archive recall, session checksums/locks, and conservative pending-effect recovery.

Filesystem tests perform real reads, creates, exact edits, backups, directory creation, rejected traversal/symlink/hardlink access, and file-hash rechecking after approval. Process tests run real local child processes, check exit codes and credential-environment stripping, and interrupt a process. A regression simulates failed result journaling after an actual write and verifies that the pending-effect record is retained.

Provider-contract tests inject fake `fetch` and evaluation functions. They inspect the actual arguments constructed by the adapters, including the typed evaluation schema, disabled internal retries, abort signal, bearer authentication, main-model JSON format, and rejection of native model tool calls. **They do not contact Vercel.**

The terminal transcript was produced with a real pseudo-terminal driver, not composed as an illustrative transcript. ANSI cursor-positioning sequences were removed for readability. The original build workspace paths are temporary.

## Why the puzzle results are not an intelligence benchmark

The default demo uses a deterministic fixture planner and a mock evaluator. The planner learns hidden switch effects from public observations; an independent checker determines whether every lamp is lit. This tests the application loop and verifier, not Jev's reasoning quality.

No baseline without Jev was measured. The seeded report explicitly labels itself `OFFLINE FIXTURES — NOT MODEL PERFORMANCE` and `comparison: false`. Zero token/cost values in fixture output mean no real inference happened; they are not estimates of live usage.

## Provider verification boundary

The adapters were checked against current official Vercel evaluation documentation, the official SDK evaluation function source, and Gateway Chat Completions documentation. `SOURCES.md` records those references. The live evaluator requires an installed AI SDK 7 release that exports `experimental_evaluate`.

The build container could not resolve the npm registry/Gateway hosts, so dependency installation did not complete. No Gateway API key was provided. As a result, the adapter is **documentation-aligned and fixture-tested, but not end-to-end verified with the actual installed SDK or a live Vercel account**.

Run `npm install`, configure a current text model from `node bin/eutrya.mjs models`, then run `node bin/eutrya.mjs doctor --live` to make one small paid evaluator check. A subsequent `puzzle --live --seed 1` exercises both real providers. Treat those as integration checks, not proof of increased intelligence or cost savings.

No lockfile is included because a real dependency resolution did not complete. After a verified installation, commit the generated lockfile to pin the tested environment.

## Remaining limitations

The implementation is not a hardened operating-system sandbox or a guarantee of exactly-once side effects. Approved programs retain the user's filesystem permissions. Reported-cost thresholds do not bound unreported provider charges. Linux is the only platform tested here. Full Pi feature parity, subscription authentication, browser automation, extensions, and multi-agent orchestration are outside this version.

## Distribution smoke test

The source ZIP was extracted to a fresh temporary directory. The complete 94-test suite, syntax checks, and offline demo passed again without dependency installation. See `distribution-check.txt`.
