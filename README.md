<p align="center"><img src="assets/eutrya-banner.webp" alt="Eutrya Agent" width="100%"></p>

# Eutrya Native

**A standalone terminal agent with Jev in its decision loop.**

Eutrya owns its CLI, sessions, state, permissions, planning loop, and tool execution. It is not a Pi extension, a Hermes skill, or an agent that has to remember to consult Jev.

```text
Task + observed state
       │
       ▼
Jev selects an attention mode
       │
       ▼
Text model proposes 1–3 concrete next steps
       │
       ▼
Jev evaluates each candidate against independent rubrics
       │
       ▼
Deterministic policy selects one candidate
       │
       ▼
State-bound, single-use decision ticket + tool permission
       │
       ▼
Execute → record observation → repeat
```

Version: **0.3.0**. Node.js **22+**. Linux-first; tested here on Linux with Node 22.16.0.


## Jev research lane

For local codebase investigations where the text model should plan globally and Jev should drive the tactical search loop:

```bash
eutrya research "Map every asset-reducing path and compare authorization assumptions" --cwd /path/to/repo
```

Research mode is deliberately read-only. The strategist produces a compact objective, invariants, explicit hypotheses, discriminating questions, and search seeds. Jev then chooses among deterministic semantic code operations for several micro-steps before returning a compact evidence packet to the strategist for replanning. This changes the expensive-model cadence from roughly one text-model proposal per tool step to one strategist call per research boundary.

Built-in semantic operations cover code-surface mapping, symbol lookup, reference/caller tracing, function/modifier inspection, state read/write tracing, and structural function comparison. Smart-contract Solidity is parsed with a bounded local structural scanner; TypeScript/JavaScript/Rust/Move receive lighter function discovery. These are research aids, not a compiler or proof engine.

The research ledger stores invariants and hypotheses as first-class state with stable IDs and statuses (`open`, `supported`, `weakened`, `closed`). Structural asymmetry is intentionally treated as a lead requiring context, not as automatic proof of a vulnerability.

## Start without credentials

From the extracted `eutrya` directory:

```bash
node bin/eutrya.mjs demo
npm test
npm run check
```

The demo and tests use only Node's built-in modules. They work **before `npm install`**.

The demo is a deterministic switchboard exercise using a **fixture planner and a mock evaluator**. The board's wiring is hidden from their observation packet. The planner learns from switch presses, while the evaluator selects between its proposals. An independent checker verifies whether all lamps are lit.

**This demonstrates the wiring and enforcement, not real Jev intelligence, real-model success rates, or cost savings.** Every mock evaluation is visibly labelled `MOCK` and stored with `source: "mock"`.

## Connect both real models through Vercel

```bash
# In the Eutrya package directory:
npm install

# Avoid putting a real key directly in shell history.
read -rsp 'Vercel AI Gateway key: ' AI_GATEWAY_API_KEY; echo
export AI_GATEWAY_API_KEY

# Discover current model IDs; do not guess a text-model name.
node bin/eutrya.mjs models deepseek

# Paste an actual TEXT model ID printed by the command above.
node bin/eutrya.mjs init --model 'PASTE_PROVIDER/TEXT_MODEL_ID_HERE'

# Local readiness checks. No model request is made.
node bin/eutrya.mjs doctor

# One small, paid Jev request to check the actual installed SDK and account.
node bin/eutrya.mjs doctor --live

# Start the agent in a workspace you choose.
mkdir -p "$HOME/eutrya-workspace"
node bin/eutrya.mjs --cwd "$HOME/eutrya-workspace"
```

The placeholder in `init` must be replaced; no text model is chosen silently. If a config already exists, edit it or supply `--model` for this invocation.

Jev uses the documented **AI SDK evaluation API**: `experimental_evaluate`, with the default model ID `typesafe-ai/jev`. The language model uses the Gateway's Chat Completions API with JSON-object output. Choose a text model that supports this response format.

This build uses Vercel API billing for both components. **It does not reuse a ChatGPT subscription, scrape credentials, or run Pi/Codex as a nested agent.** There is no second agent with a separate tool-execution path.

The `ai` dependency is declared as `^7.0.105`; `doctor` verifies that the installed package actually exports `experimental_evaluate`. The evaluation interface is experimental, so verify SDK compatibility before trusting a long run.

## A coding session

```bash
# Writes need approval by default. This flag authorizes workspace writes,
# edits, and directory creation for this invocation.
node bin/eutrya.mjs --cwd "$HOME/my-project" --allow-write

# Also offer local command execution. Each individual command still needs
# explicit approval, even when --allow-write is present.
node bin/eutrya.mjs --cwd "$HOME/my-project" --allow-write --allow-exec
```

Then enter a task such as:

```text
Read the source, explain how the parser works, and add a focused unit test
for its empty-input case. Report what was actually checked.
```

Available workspace actions are directory listing, text reading, literal search, directory creation, create/replace, exact text edit, local process request, notebook note, observation recall, asking a question, and returning an answer.

The model produces **data describing actions**, not executable native tool calls. Unknown action types, nested batches, extra action fields, and provider-emitted native tool calls are rejected.

Process execution uses an executable and argument array, not an implicit shell. **It is not an operating-system sandbox.** An approved program can access whatever your user account can access. Use a disposable workspace/container for unfamiliar repositories and carefully review every process approval.

## Steering and interruption

| Command | Effect |
| --- | --- |
| `/status` | Current attention, status, session ID, steps, usage, and request counters. |
| `/steer TEXT` | Add guidance. The runtime discards an obsolete plan before executing the next action. |
| Ordinary text while busy | The same as steering. It does not create a competing run. |
| `/stop` or Ctrl+C | Cancel an in-flight model request or interrupt an approved process. |
| `/continue` | Resume with a new decision cycle and another step-limited burst. The session's request budget is not reset. |
| `/compact` | Run Jev relevance pruning while idle. Exact originals remain in the event/archive store and usage is retained. |
| `/trace` | Recent attention and candidate-selection records. These are decision summaries, not private thought transcripts. |
| `/model provider/model` | Change the text model for this session while idle. |
| `/swarm` | Display live swarm organization status, agent roles, active tasks, and blockers. |
| `/agents` | List all swarm agent profiles, specializations, tools, and models. |
| `/agent NAME` | Switch direct interactive focus to a specific specialist agent. |
| `/agent rename ID NEW_NAME` | Rename an existing swarm agent. |
| `/agent remove ID` | Remove a swarm agent. |
| `/tasks` | List shared workspace tasks and backlog. |
| `/findings` | List shared organizational findings. |
| `/template [NAME]` | View or apply an organization template (default, engineering, startup, legal, research). |
| `/thinking [on\|off]` | Toggle display of candidate thinking/summary (hidden by default). |
| `/reload` | Save the current session and restart the harness with updated code while preserving conversation history. |
| `/resolve INSPECTION_NOTE` | Reconcile an uncertain effect **after** inspecting what actually happened. |
| `/quit` | Stop and leave the session saved. |

## Native Swarm Architecture

Eutrya is designed as a persistent organization of specialized AI agents, not a single chatbot with subagents:

1. **Five Default Persistent Profiles**:
   - **Admin / Chief of Staff** (`admin`): Primary orchestrator that interacts with the user, decomposes objectives, delegates tasks, and synthesizes final results.
   - **Engineer** (`engineer`): Software engineering, systems architecture, debugging, infrastructure, and technical implementation.
   - **Legal / Policy Analyst** (`legal`): Contracts, regulation, compliance, liability risk identification, and structured legal argumentation.
   - **Finance / Business Analyst** (`finance`): Financial modeling, unit economics, market analysis, pricing, and cost auditing.
   - **Researcher / Strategist** (`researcher`): Deep research, information synthesis, competitive intelligence, and long-horizon strategy.

2. **Jev as the Cognitive Layer**:
   Jev sits underneath every agent in the swarm. Before taking actions, proposals and attention modes are continuously evaluated through Jev to ensure actions are grounded, productive, non-repetitive, and appropriate for the agent's role.

3. **Swarm Communication & Event-Driven Routing**:
   Targeted events (`TASK_ASSIGNED`, `IMPLEMENTATION_REQUIRED`, `RESEARCH_REQUIRED`, `LEGAL_REVIEW_REQUIRED`, `FINANCIAL_ANALYSIS_REQUIRED`, `CANDIDATE_RESULT`, `BLOCKED`, `TASK_COMPLETE`) wake only the relevant specialist agent, keeping token consumption bounded.

4. **Shared Workspace**:
   Agents collaborate through structured organizational memory (`tasks`, `findings`, `decisions`, `artifacts`, `messages`, `evidence`, `openQuestions`, `blockers`, `agentStatus`) rather than unbounded group chat histories.

5. **Direct Conversations**:
   Users can address any specialist directly using `@AgentName <task>` (e.g. `@Engineer Fix the parser` or `@Finance Calculate the unit margin`) or switch focus using `/agent <name>`.

6. **Dynamic Organization Templates**:
   Easily switch templates using `/template <name>`:
   - `default`: Admin, Engineer, Legal, Finance, Researcher
   - `engineering`: Architect, Backend Engineer, Frontend Engineer, QA, Researcher
   - `startup`: CEO, Engineer, Product, Finance, Growth
   - `legal`: Lead Counsel, Contracts Reviewer, Compliance Officer, Evidence Analyst, Researcher
   - `research`: Principal Investigator, Experimentalist, Literature Specialist, Skeptic, Synthesizer

Steering takes effect at decision boundaries. It cannot undo an already-completed write or guarantee reversal of a process's partial effects.

## Sessions and recovery

```bash
node bin/eutrya.mjs sessions --cwd "$HOME/my-project"
node bin/eutrya.mjs --cwd "$HOME/my-project" --resume latest
node bin/eutrya.mjs trace SESSION_ID --cwd "$HOME/my-project"
```

Config defaults to `~/.config/eutrya/config.json`. Sessions default to `~/.local/state/eutrya/<workspace-hash>/<session-id>/` and include:

```text
state.json       Checksummed, atomically replaced state snapshot
lock             Single-controller process lock
events.jsonl    Hash-linked observation, decision, and provider-event records
backups/         Original content of files before approved writes/edits
```

Eutrya journals a pending effect before a write, edit, directory creation, or command. It records the result durably before clearing that entry. On an interruption, failed journal write, or ambiguous restart, **the effect is not automatically replayed**. The session enters `NEEDS_REVIEW` and requires operator reconciliation.

This is conservative recovery, **not exactly-once execution or a filesystem transaction**. Neither a file checksum nor a hash-linked trace protects against someone who can freely rewrite your local program and state files.

## Real-model puzzle exercise

```bash
node bin/eutrya.mjs puzzle --live --seed 7
node bin/eutrya.mjs bench --live --seeds 1,2,3
```

Both require your configured models/key and incur provider charges. Puzzle sessions expose only the switchboard, notebook, recall, ask, and finish actions—not workspace reads or process execution. The hidden board state is not included in model/evaluator packets.

```bash
# Offline controller fixtures, not a performance benchmark:
node bin/eutrya.mjs bench --seeds 1,2,3
```

The benchmark command runs the same harness over selected puzzle seeds. It does not supply a main-model-only baseline and is not an A/B test of Jev's benefit. Its report explicitly says `comparison: false`.

## Limits and cost visibility

A normal cycle makes **two evaluation calls and one text-model call**. Candidate evaluation questions are batched into one request; Eutrya does not make a separate evaluator request for each candidate.

Defaults:

| Setting | Default | Meaning |
| --- | ---: | --- |
| `maxSteps` | 24 | Steps per user-authorized burst. `/continue` allows another burst. |
| `maxCalls` | 150 | Hard session-wide cap on reserved application-level provider attempts, including retries. |
| `maxPromptChars` | 48,000 | Input-size limit measured in characters, including the constructed prompt/rubrics. Not a token count. |
| `maxOutputTokens` | 6,144 | Maximum requested text-model output tokens. |
| `timeoutMs` | 90,000 | Per-provider-attempt local deadline. |
| `retries` | 1 | Additional retry for a returned HTTP 429/5xx only. Timeouts are not retried automatically. |
| `maxKnownCostUsd` | null | Optional stop threshold on **reported** cost. Not a hard all-in dollar cap. |

Requests are reserved to disk before dispatch. A crashed attempt remains counted; a new session is required to start an independent budget. `/compact`, `/continue`, and process restart do not reset the existing meter.

Jev auto-compaction is active by default at full-work model-request boundaries. It replaces the old last-12 packet slice, result clipping, and >48/last24 observation eviction for attached runtimes. Jev evaluates completed read-only call/result pairs through the existing `runtime.call('jev.compaction', ...)` budget path; retained text stays exact, and full originals are archived under each session's private state directory. Use `--no-compaction` or `jevCompaction: false` only as an explicit rollback to the legacy bounded window. Small adaptive fast replies do not start the full-work compactor.

Usage displays distinguish reported input/output tokens, missing usage, known reported API cost, and unpriced attempts. **Unknown cost is not reported as zero cost.** Provider-side work can continue after local cancellation, and an aborted request may be billable. Configured dollar thresholds cannot bound unreported charges.

There is no claim yet that adding Jev makes the selected text model smarter or cheaper. The additional evaluations have a cost; their net value needs a controlled live comparison.

## Permissions and data handling

Paths must remain relative to the selected workspace. Common credential/state paths, symlinks, hard-linked files, binary reads, oversized file reads, and implicit parent-tree creation are rejected. Existing-file writes and edits require the hash returned by a read, and edits require one exact match. Hashes are rechecked after approval.

These checks are useful constraints, **not an audited sandbox against a hostile local process racing the filesystem**. Search ignores common generated/dependency/private directories and uses bounded literal matching.

The runtime removes known credential environment variables from the local process environment and redacts known environment-secret values in normal model-visible results and logs. This is best-effort, not complete secret detection. An approved process still has the user's filesystem access. File backups intentionally preserve original content locally, with restrictive permissions.

Selected workspace text, task information, and tool observations are sent to the configured model services. Do not use confidential workspaces unless that data transfer is approved. Review the providers' data policies separately.

## Validation status

See `docs/VERIFICATION.md` and `docs/test-results.tap` for the actual test run.

The local core, mocked provider contracts, filesystem tools, process controls, CLI commands, and interactive terminal path were tested. **A live Vercel/Jev call was not run here**, and the actual AI SDK package could not be installed in this build environment because external DNS resolution failed. Consequently, the included adapter is documentation-aligned and fixture-tested, not end-to-end certified against your account or the installed SDK.

There is no generated dependency lockfile. Run `npm install`, check `doctor --live`, and commit the resulting lockfile once the installed SDK/provider combination has been verified in your environment.

## Source layout

```text
bin/eutrya.mjs            CLI and interactive session routing
src/runtime.mjs          Mandatory evaluation/proposal/evaluation loop
src/gate.mjs             State-bound, single-use execution tickets
src/policy.mjs           Validated probability distributions and deterministic selection
src/providers/jev.mjs    Real typed Jev evaluation adapter
src/providers/gateway.mjs Real Vercel text-model adapter; no native tool dispatch
src/providers/mock.mjs   Explicit offline fixtures only
src/tools.mjs            Workspace actions, permissions, process runner
src/store.mjs            Session snapshots, locking, trace, observation archive
src/memory.mjs           Legacy bounded context used only when Jev compaction is explicitly disabled
extensions/eutrya-jev-compaction-extension/  Active archive-backed Jev context pruning
src/puzzle.mjs           Local switchboard and independent checker
src/ui.mjs               Terminal events and one-action approvals
tests/                   Offline regression and contract tests
```

This is a small standalone implementation, not full Pi feature parity: no extension marketplace, MCP loader, browser, multiple-agent orchestration, token-by-token interleaving inside a hosted model, or full-screen terminal UI is included.
