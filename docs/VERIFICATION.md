# Eutrya Native 0.3.1 — verification record

Build date: **September 18, 2026, America/Phoenix**. Environment: **Linux, Node.js v22.16.0**.

## Current local results

| Check | Result | Evidence |
| --- | --- | --- |
| Offline/local tests | **220 passed, 0 failed, 0 skipped** | `test-results.tap` |
| JavaScript syntax | **52 modules passed** | `syntax-check.txt` |
| Package dry-run | **Passed**; research runtime/code/schema are included | npm `pack --dry-run` during release verification |
| CLI help | **Passed**; reports 0.3.1 and documents `eutrya research` | release verification command |
| Research semantic tools | **Passed** on a local Solidity fixture | `tests/research.test.mjs` |
| Strategist/Jev boundary loop | **Passed** with deterministic providers: 2 strategist calls, 3 Jev-driven local steps | `tests/research.test.mjs` |
| Browser content test | **Passed hermetically** against a local HTTP fixture | `tests/tools-store.test.mjs` |
| Live paid inference | **Not performed in this packaging pass** | no claim of live provider certification |

## 0.3 research-lane acceptance checks

The new lane keeps the normal Eutrya controller intact and adds a separate read-only code-research path. Tests verify that the strategist is called only at research boundaries while Jev selects multiple local semantic actions between those boundaries. The persisted research ledger carries stable invariant and hypothesis objects, observed evidence IDs, explored-action hashes, and compact round packets.

The semantic code layer is intentionally bounded. Solidity receives structural function/modifier extraction plus calls, modifiers, state-write signals, external-call signals, references, and state read/write tracing. TypeScript/JavaScript/Rust/Move receive lighter function discovery. This is not a compiler-grade AST, symbolic execution engine, formal verifier, or automatic vulnerability oracle.

Research mode permits only local read-only semantic code actions. It does not execute repository processes, browse production systems, deploy contracts, send transactions, or treat structural asymmetry as proof of a vulnerability.

## What these results do not establish

The local suite validates controller wiring, state/ticket enforcement, parser behavior on fixtures, and provider adapter request construction. It does not establish live-model quality, token-cost reduction, vulnerability-finding rates, production reliability, or formal security correctness. Those require controlled evaluations against held-out codebases and live provider credentials.
