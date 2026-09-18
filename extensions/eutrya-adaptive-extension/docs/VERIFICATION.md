# Verification record — Adaptive Extension 0.1.0

Build date: 2026-09-17 America/Phoenix / 2026-09-18 UTC.
Environment: Linux, Node.js 22.16.0. The extension has no npm dependencies.

## Executed successfully

| Check | Actual result |
|---|---|
| Extension unit/integration tests | **97 passed, 0 failed, 0 skipped** |
| JavaScript syntax validation | **21 modules passed** |
| Offline demonstration | Completed; every evaluator is labelled MOCK |
| Real local HTTP stream transport | Passed through a loopback server using actual fetch and SSE parsing |
| Native v0.2 compatibility check | Passed against the actual supplied runtime `Eutrya.call` and actual `selectCandidate` |
| Original Native v0.2 baseline suite | **179 passed, 0 failed**, before any host modifications |

The Native compatibility test used injected **mock inference**, not a live provider. It confirmed that an extension fast reply invoked the host's real metering entrypoint twice (one Jev request, one text request) and that a stabilized native selection retained the original eligibility gate. It did not certify the user's subsequently added swarm implementation.

The original 179-test suite is a baseline for the unchanged supplied host, not a claim that all of those tests were rerun with the new hooks installed into the user's private branch.

Raw evidence: `test-results.tap`, `syntax-check.txt`, `demo-output.txt`, and `native-compatibility.json` in this directory. A fresh-extraction release check also ran these entrypoints successfully before delivery.

## Tested behavior

The tests cover deterministic selection given identical scored inputs/history, stable ties, near-equal strategy retention, clear-evidence switching, immutable ineligibility, bounded learned bias, negative evidence, task-class isolation, deduplication, reversible corrections, freeze/reset, persistence and separate-user scopes.

Fast-lane tests cover one evaluator plus one text request, no tools, conservative work routing, large-context handoff, confidence rejection, evaluator failure, stale/single-use permits, cancellation, unknown pricing, streaming consistency, token allowance changes, and natural stand-alone correction capture.

Activation tests cover zero-cost sleeping, one-member selection, Jev decline, configured event filters, manual-only/disabled members, resident-versus-child identity, temporary subagent delegation, expired delegation capability, permission narrowing, template limits, depth/count/concurrency/root budgets, nonreentrant residents, stale task/configuration decisions, style steering without swarm shutdown, timeout quarantine, manual reconciliation and restart without automatic replay.

Transport tests cover byte-split Unicode, CRLF, keepalive comments, reasoning-field omission, usage, tool-call rejection, errors, truncation, required stop/DONE markers, provider endpoint restrictions, secret-free HTTP error messages, terminal control-byte filtering and a real loopback connection.

## Not tested / not claimed

- No real Vercel Jev, OpenRouter, Ollama or other model request was made; no provider credentials were supplied.
- The user's newest swarm source was not available. Its runner, event and delegation hooks must still be connected and tested by the user's coding agent.
- The add-on does not independently authenticate external checker results; the host must supply trustworthy checker outcomes.
- No live speed, cost reduction, probability calibration, policy convergence, model intelligence improvement, or five-second response guarantee is established by these fixtures.
- No hosted model weights are changed and no unrestricted self-modification is implemented.
- No OS sandbox, distributed transaction, exactly-once side effect, or forced termination of uncooperative in-process code is claimed.
- An optional attempt to obtain the host AI SDK in this environment failed with npm registry DNS resolution (`EAI_AGAIN`). The add-on itself does not need that installation and all listed local checks ran without it.

## Reproduce

```bash
cd eutrya-adaptive-extension
npm test
npm run check
npm run demo
node integration/verify-native.mjs /absolute/path/to/eutrya
```

Run the last command against a compatible host checkout. It does not need real credentials and explicitly identifies inference as MOCK. After actual glue changes, add host-specific end-to-end tests and run a small, authorized live smoke check before claiming production integration.
