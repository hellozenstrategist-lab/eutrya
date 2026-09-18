# Eutrya Native architecture · 0.3.0

```text
CLI / messaging ingress / explicit job / explicit task batch
                        │
                        ▼
             Profile + isolated Session Store
                        │
   approved memory / skills / project references / observations
                        │
                        ▼
             Jev attention evaluation (Vercel)
                        │
                        ▼
 Text proposal (Vercel / OpenRouter / compatible API / local Ollama)
                        │
                        ▼
          Jev batched candidate evaluation (Vercel)
                        │
                        ▼
    Deterministic policy → state-bound single-use action ticket
                        │
                        ▼
          Independent permission + effect journal
                        │
                        ▼
             Tool outcome → observation → repeat
```

## Core invariants

The runtime—not the model—calls Jev. Each cycle reserves budget for every model attempt. It provides a compact state packet, requests attention, asks the text component for at most three structured proposals, evaluates those proposals against independent rubrics, selects one, validates tool arguments/paths, and issues a ticket bound to the current state and proposal hash.

A tool can execute only after consuming that ticket and passing its independent approval policy. The executor is private behind Toolbox.execute. Steering invalidates stale decisions, and stop controls remain independent. Model-emitted provider-native tool calls are rejected. External data is not upgraded to an instruction capable of granting privileges. There are no nested native auto-tool loops.

These controls guarantee consultation and action-path enforcement, not that Jev has superior judgment. Neither Jev confidence nor a model summary counts as independent evidence. The puzzle environment provides a separate completion checker; ordinary tasks are labelled answered without independent verification unless their observations establish it.

## Modules

| Module | Responsibility |
| --- | --- |
| `bin/eutrya.mjs`, `src/ui.mjs` | Standalone CLI, sessions, human controls, terminal approvals |
| `src/commands.mjs` | Setup, profiles, provider inventory, memory/skills, gateway/jobs/team/MCP commands |
| `src/runtime.mjs` | Mandatory control/propose/rank/execute loop |
| `src/research-runtime.mjs`, `src/research-schema.mjs` | Strategist/Jev research boundaries, structured invariant/hypothesis ledger |
| `src/research-code.mjs` | Read-only semantic code surface/symbol/reference/state/function analysis |
| `src/gate.mjs`, `src/policy.mjs` | Single-use tickets, validated probability distributions, deterministic selection |
| `src/providers/gateway.mjs` | Explicit text-provider endpoint/key routing; no tool execution |
| `src/providers/jev.mjs` | SDK typed evaluation adapter; no silent text/mock fallback |
| `src/bootstrap.mjs` | Reuse the same core for messaging, scheduler, and read-only team workers |
| `src/tools.mjs`, `src/schema.mjs` | Strict action vocabulary, argument validation, permission and effect execution |
| `src/store.mjs`, `src/memory.mjs` | Checkpoint/journal state, locking, archived observations, deterministic compaction |
| `src/knowledge.mjs` | Approved persistent memory, local skill/draft namespaces, project/persona references |
| `src/mcp.mjs` | Explicit trusted stdio/HTTP clients, catalog allowlists, input validation |
| `src/gateway/*` | Transport normalization, authentication, queues, isolated routes, approvals, delivery |
| `src/scheduler.mjs` | Claim-before-run cron/one-shot jobs and bounded explicit read-only batches |
| `src/environment.mjs`, `src/local-state.mjs`, `src/http.mjs` | Credential parsing, atomic control state, bounded HTTP primitives |


## Jev research lane

```text
Strategist text model
  global objective / invariants / hypotheses / search seeds
                        │
                        ▼
              Jev local decision loop
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
   symbol/surface   caller/state   compare/inspect
         │              │              │
         └──────────────┼──────────────┘
                        ▼
               evidence observations
                        │
                Jev continue/escalate
                        │
                        ▼
             compact evidence packet
                        │
                        ▼
                strategist replan
```

The research lane is intentionally separate from the normal proposal/rank loop. It uses only read-only local semantic code tools. The strategist does not micromanage file operations; it defines the investigation state. A deterministic frontier generator turns that state plus observed code relationships into bounded candidate actions, and Jev selects the next action. After a configured micro-step boundary, meaningful escalation, or stagnation, the strategist receives compact evidence and updates stable invariant/hypothesis objects.

Research decisions use the same single-use state-bound ticket machinery as ordinary actions. Research state is included in the semantic state hash, so a ticket becomes stale when the ledger changes.

## Messaging flow

An adapter verifies transport authenticity as applicable, normalizes a text envelope, then the router checks the sender and chat allowlist before reserving any model work. Its route key contains platform, chat, thread and sender. Event IDs provide bounded persistent deduplication. Ordinary messages enter a durable bounded queue; each route has one worker at a time. Distinct routes can proceed concurrently within the configured limit.

Small controls can act while a run waits for models or approval. Approval tokens live only in process memory, bind one route/action, expire after two minutes, and are never restored automatically after restart. Each route has its own workspace, session and knowledge namespace. Native adapters receive final text from the router, not independent agent instructions.

The daemon persists running claims and outgoing send states. Restart does not automatically replay an in-flight action or an uncertain send. Queued, not-yet-started messages may proceed. Scheduler deliveries recheck current allowlists, then use the same send journal without launching a new model run.

## Knowledge and tools

Only reviewed memories/skills enter the active context. Memory facts remain user assertions; a skill is a bounded procedural reference. The system includes skill summaries and lets the model select a skill-read action through Jev; it does not inject an unlimited repository of instructions on every turn.

MCP capability discovery occurs only after trusted local configuration is explicitly loaded. Discovery does not authorize calls. The model sees allowed tool descriptions/schemas; the eventual `mcp` action is schema-checked, Jev-evaluated, permission-gated, journaled and recorded like other actions. No server sampling/elicitation callback starts another model executor.

## Deliberately constrained automation

Scheduled jobs are local, serial and read-only by default; optional local write authorization is job-specific and never enables process execution. Explicit team mode starts a bounded set of user-written read-only tasks with one shared request cap. No model can create jobs, recruit new workers, alter daemon config, install transport services, or increase budgets through the action vocabulary.

## State and compatibility

Existing v0.1 config files merge new defaults. Sessions retain schema version 1 with additive controller metadata; back up before updating. Separate profiles avoid shared live/mock identities. New profile configuration is in `~/.config/eutrya/profiles/NAME`; default sessions stay under `~/.local/state/eutrya`, while new knowledge/control data defaults to `~/.local/share/eutrya`.

Local JSON transactions use exclusive short lock files and atomic replacement. Daemon process locks recover a demonstrably dead same-host owner; interrupted data transactions fail closed for inspection. This architecture favors preventing unreviewed repetition over automatic high-availability recovery. It is not distributed consensus, a transactional filesystem, or exactly-once execution.
