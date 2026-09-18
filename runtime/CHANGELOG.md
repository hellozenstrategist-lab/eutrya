# Changelog

## 0.2.0 — Provider and messaging foundation

Added main-text adapters for OpenRouter, Vercel, compatible endpoints and Ollama while keeping Jev on its separate typed evaluation API. Added explicit per-request Jev ZDR opt-in without forcing it on incompatible plans.

Added standalone setup, isolated profiles, hidden credential prompts/private env parsing, provider/model inventory, diagnostics, session export, workspace usage, slash completion and new-session controls.

Added Telegram, Discord, Slack, Matrix unencrypted, Signal external bridge, WhatsApp Business Cloud API and signed-webhook text adapters. Added deny-by-default sender allowlists, route isolation, persistent bounded queues/deduplication, stop/steer/approval controls, rate/request caps, process locks and conservative delivery/restart recovery.

Added approved memory, local procedural SKILL.md installation/drafts, project/persona references, explicit trusted MCP tools for local sessions, local cron/one-shot jobs, scheduled route delivery and bounded user-specified read-only task batches.

Retained the original 94 tests and added 85 tests for a total of 179 at packaging. Live external services remain unverified; npm dependency installation was blocked by DNS in the build environment. Feature gaps are listed explicitly in docs/COVERAGE.md. No Nous-specific services or subscription authentication were added.

## 0.1.0

Original standalone CLI, mandatory Jev attention/proposal/ranking controller, state-bound single-use tickets, filesystem/process controls, durable sessions, explicit offline switchboard fixtures and independent puzzle verification.
