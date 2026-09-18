# Changelog

## 0.4.0 — Jev-routed hunt Kanban

Unified the former desktop-frontend branch into the main v0.4 codebase. The Tauri desktop now launches the same root NativeSwarm backend as the CLI, uses the security-specialist profiles, exposes hunt-board state through its bridge, and installs as `eutrya-desktop` without replacing the `eutrya` CLI command.

Added persistent hunt boards that store the authorized program page, normalized rules, scope, exclusions, testing constraints, and bounded hunt cards. Admin can create boards/cards through native tools after reviewing the user-supplied hunt page and rules.

Added availability-aware Jev routing. Busy, blocked, or otherwise non-idle specialists are excluded from the next assignment choice, so work is routed among the remaining Auditor, Operator, Sentinel, and Analyst residents rather than queued behind one agent. Ready work moves through active execution and independent review; review avoids the original worker when another specialist is available.

Added `/hunt`, `/hunt run`, pause/resume controls, a terminal Kanban view, persistent route history, board state in shared context, and hunt routing regression tests.


## 0.3.1 — Security-native default swarm

Replaced the generic default Engineer, Legal, Finance, and Researcher profiles with Auditor, Operator, Sentinel, and Analyst while retaining Admin as the primary orchestrator. Updated Jev profile routing, security event destinations, mock routing, tool examples, tests, and documentation. The new roles separate vulnerability discovery, controlled execution, independent verification, and architecture/research synthesis.


## 0.3.0 — Jev research lane

Added a separate strategist/executor research mode for local codebase review. The text model now plans at investigation boundaries while Jev drives several read-only semantic code lookups between replans. Added first-class invariant and hypothesis state, compact evidence packets, Jev escalation/stagnation decisions, and state-bound action tickets for research micro-steps.

Added semantic code tools for surface mapping, symbol lookup, caller/reference tracing, function/modifier inspection, state read/write tracing, and structural function comparison, with Solidity-oriented structural extraction and lighter support for several common code extensions.

Made the browser-content test hermetic instead of depending on public internet access. Current package verification is 220/220 tests passing.

## 0.2.0 — Provider and messaging foundation

Added main-text adapters for OpenRouter, Vercel, compatible endpoints and Ollama while keeping Jev on its separate typed evaluation API. Added explicit per-request Jev ZDR opt-in without forcing it on incompatible plans.

Added standalone setup, isolated profiles, hidden credential prompts/private env parsing, provider/model inventory, diagnostics, session export, workspace usage, slash completion and new-session controls.

Added Telegram, Discord, Slack, Matrix unencrypted, Signal external bridge, WhatsApp Business Cloud API and signed-webhook text adapters. Added deny-by-default sender allowlists, route isolation, persistent bounded queues/deduplication, stop/steer/approval controls, rate/request caps, process locks and conservative delivery/restart recovery.

Added approved memory, local procedural SKILL.md installation/drafts, project/persona references, explicit trusted MCP tools for local sessions, local cron/one-shot jobs, scheduled route delivery and bounded user-specified read-only task batches.

Retained the original 94 tests and added 85 tests for a total of 179 at packaging. Live external services remain unverified; npm dependency installation was blocked by DNS in the build environment. Feature gaps are listed explicitly in docs/COVERAGE.md. No Nous-specific services or subscription authentication were added.

## 0.1.0

Original standalone CLI, mandatory Jev attention/proposal/ranking controller, state-bound single-use tickets, filesystem/process controls, durable sessions, explicit offline switchboard fixtures and independent puzzle verification.
