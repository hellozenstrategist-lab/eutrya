# Eutrya Native 0.2.0 — verification record

Build date: **September 17, 2026, America/Phoenix** (September 18 UTC for the final checks). Environment: **Linux, Node.js v22.16.0, npm 10.9.2**.

This release extends the attached v0.1.0 source. Historical v0.1 records are under `history/v0.1/`; they are not current test results.

## Actual results

| Check | Result | Evidence |
| --- | --- | --- |
| Offline tests | **179 passed, 0 failed, 0 skipped**; includes all 94 original tests and 85 new tests | `test-results.tap` |
| JavaScript syntax | **41 modules passed** across src, bin, tests, and examples | `syntax-check.txt` |
| Foreground CLI gateway and sample client | **Passed**: signed loopback HTTP message → router → mandatory mock Jev evaluations → fixture text reply → authenticated outbox | `release-smoke.json`, `repl-transcript.txt` |
| Gateway shutdown | **Passed**: SIGTERM, exit 0, status recorded, owner lock removed | `release-smoke.json` |
| Scheduler shutdown | **Passed**: idle foreground scheduler SIGTERM, exit 0 | `release-smoke.json` |
| Real pseudo-terminal session | **Passed**: status, task, independently VERIFIED fixture result, new session, quit | `repl-transcript.txt` |
| Real pseudo-terminal onboarding | **Passed**: OpenRouter plus Jev setup, dummy keys not echoed, private env file mode 0600 | `release-smoke.json`, `repl-transcript.txt` |
| Current switchboard seeds 1–20 | **20/20 verified in offline fixture mode**; no A/B comparison | `seeded-fixtures.json` |
| Installed external dependency execution | **Not verified**: npm install failed resolving registry.npmjs.org (`EAI_AGAIN`) | `dependency-install.txt` |
| Live Jev, Vercel text, OpenRouter, compatible server, or Ollama inference | **Not performed**; no API credentials/server supplied | No paid inference performed |
| Real Telegram/Discord/Slack/Matrix/Signal/WhatsApp account round trips | **Not performed** | Protocol fixtures and local webhook tests only |
| Fresh ZIP extraction | See `distribution-check.txt` for the actual release check | Repeats tests, syntax checks, demo from a fresh extracted copy |

These are JavaScript syntax checks and behavioral tests, not a TypeScript typecheck or a formal security proof. No skipped test is being represented as a passing live integration.

## What was exercised

The original suite verifies evaluator consultation and influence, strict model output and action schemas, state-bound single-use tickets, invalid/stale/forged/replayed decisions, provider retries/timeouts, stop and steering, persisted request budgets, independent puzzle verification, compaction, recall, local session checksums/locks, and conservative pending-effect recovery. Filesystem/process tests use real temporary files and local child processes, with hash rechecks, backups, scope restrictions, approval, cancellation, and credential-environment filtering.

New foundation tests cover provider separation and model discovery, compatible-server formatting, Jev retention opt-in, literal environment imports, profiles, private credential storage, atomic state and locks, approved memory, reviewed local skills, lower-trust project references, and integration into the original decision loop.

Gateway tests cover explicit allowlists, platform/chat/thread/sender isolation, HMAC signatures, timestamp expiry, duplicate receipts, queue/concurrency limits, single-use and identity-bound approvals, stop and steering, live/mock separation, shared daily attempt caps, interrupted work, scheduled-result reauthorization, and uncertain delivery handling. They use the actual router and core with explicit mock providers. Adapter fixtures examine normalization, topic/thread addressing, polling/backlog behavior, plain-text output, Slack acknowledgement ordering, Signal direct-message limits, and Matrix encryption refusal.

Two adapter tests use real local HTTP servers: a signed generic webhook round trip and WhatsApp-style verification challenge/raw-body signature validation. **The local WhatsApp test is not a connection to Meta.** Its fictional Graph version is confined to protocol fixtures.

Scheduler/team tests cover numeric cron parsing, IANA timezone interpretation, one-shot validation, persistent claims, restart review, shared budgets, parallel read-only tasks, and actual mock core runs. MCP tests inject a fake SDK/schema-validation seam; they check trust/allowlists/arguments and prove a selected external-tool action still requires Jev and approval. **The actual MCP SDK and Ajv packages were not installed or exercised.**

CLI subprocess tests exercise setup, providers, gateway configuration, memory/skills and path discovery, jobs, disabled MCP templates, doctor, demo, and trace export. A separate release smoke run uses an actual pseudo-terminal rather than an illustrative transcript. ANSI controls were removed and temporary workspace paths normalized in the supplied transcript; output outcomes were not changed.

## External integration boundary

Implementation references are recorded in SOURCES.md. Jev uses the documented `experimental_evaluate` interface, not a chat-completions request. Main providers use their selected OpenAI-compatible text routes. Optional SDK versions are declared in package.json, but runtime integration with those installed packages remains **unverified**.

`npm install --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=6000` returned exit 1 because this environment could not resolve the npm registry. No lockfile is fabricated. This is a specific environment failure, not a claim that the packages cannot be installed elsewhere.

After installation, run `eutrya doctor`, then `eutrya doctor --live` to make one paid Jev smoke call. A small `eutrya puzzle --live --seed 1` additionally exercises the configured main provider. Verify each messaging platform with a dedicated account and small request budget before exposing it to users. `doctor --live` does not certify messaging, MCP, every text model, or production reliability. Commit the resulting lockfile only after verifying the installed dependency combination.

## What these results do not establish

The demo uses fixture providers. The switchboard results test controller wiring and an independent checker, **not real Jev intelligence or live-model success rates**. The echo fixture used in messaging tests only returns a receipt; it is clearly labelled and not a general-purpose model. No held-out main-model-only baseline, reasoning improvement, or token/cost reduction has been measured.

There is no production certification, adversarial security audit, OS sandbox, multi-host failover, unlimited context, or exactly-once side-effect guarantee. Approved local processes and trusted external tools can act with the permissions of their execution environment. Unknown reported costs remain unknown. See SECURITY.md and COVERAGE.md for the exact boundaries, including missing Hermes features.

No npm publication, external deployment, bot linking, scheduled personal automation, or modification of the user's machine was performed by these build checks.
