# Eutrya Adaptive Extension

**Version 0.1.0 — an add-on bundle, not another Eutrya installation.**

Adds stable decision selection, durable corrections, bounded experience-based policy adaptation, a fast tool-free response lane, and Jev-gated activation of your **existing** resident agents and their temporary subagents.

Your current swarm, profiles, private histories, gateways, providers, workspace tools and approvals stay in the host. This package does not create a competing swarm, replace the CLI, or install a second execution loop. No Nous integration is added.

Node.js 22+. Zero new dependencies. Native adapters were checked against the actual supplied Eutrya Native **0.2.0** runtime; your newer swarm code was not supplied. Its two invocation callbacks still need to be connected by your coding agent.

## Start here

Give your coding agent this folder and **[AGENT_GLUE.md](AGENT_GLUE.md)**. That file specifies the integration seams and acceptance checks. Do not replace your repository with this package.

From your existing project root, extract the ZIP under `extensions/`:

```bash
mkdir -p extensions
unzip /path/to/eutrya-adaptive-extension-v0.1.0.zip -d extensions
cd extensions/eutrya-adaptive-extension
npm test
npm run check
npm run demo
```

There is no `npm install` requirement for the add-on. Live Jev evaluation continues to use the AI SDK and credentials already configured in the host. The offline demo is explicitly MOCK, not a real-model performance benchmark.

## What changes

### 1. Stable decisions without pretending the model is deterministic

Jev still evaluates the alternatives. The selector applies stable sorting and bounded, history-aware adjustments to the **already eligible** candidates. When two strategies are almost equally valued, it can keep the current strategy instead of switching back and forth. A clearly better alternative wins; newly ineligible work never survives through habit.

The selection is deterministic **for identical evaluated candidates and identical policy/history state**. It is not a guarantee that fresh Jev calls or text-model generations return the same values. No semantic cache replays old tool actions.

Default maximum learned adjustment: 0.06 score units. Default near-equal retention margin: 0.025. At least four distinct checked decisions are required before a strategy receives an experience-based adjustment.

### 2. Corrections that persist and can be undone

The command adapter recognizes `/feedback ...` and a narrow set of stand-alone corrections such as “Be concise”, “Answer first”, “That was too long”, and “More detail please.” These common corrections require no extra LLM call. Quoted instructions inside files or tool results are not processed as user corrections.

```text
/feedback Stop renaming my variables unless the name is actually wrong.
/feedback Answer first. This is too long.
/adaptive status
/adaptive freeze
/adaptive thaw
/adaptive forget FEEDBACK_ID
```

Typed preferences alter brevity, answer order and the fast lane's output allowance. Arbitrary corrections are stored as scoped preference notes and forwarded to the host's steering callback. They are guidance, not a promise of perfect semantic compliance. Explicit changes to activation permissions use admin configuration, not a guessed interpretation of prose.

An ordinary style correction cancels a stale in-progress fast reply, but **does not shut down resident agents**. Connect `onCorrection` to the existing runtime's steering mechanism so ongoing work incorporates the correction at its next boundary. Admin changes to activation rules invalidate and cancel affected-scope activations conservatively.

### 3. Bounded improvement from checked outcomes

Call `recordOutcome` after a trusted checker actually reports pass/fail for the selected decision. Outcomes are keyed to a known decision, deduplicated, scoped to a task class, and retained in a rolling window. The policy uses a smoothed success/failure estimate to slightly favor strategies with better observed results.

This is **harness-level policy adaptation**, not model training and not unrestricted recursive self-modification. It never changes Jev/DeepSeek weights, executes self-edits, changes permission eligibility, or takes the model's own assertion of success as an independent check. Improvement is not guaranteed; measure it on held-out tasks. Freeze, reset and individual outcome removal are available through owner controls.

### 4. Fast ordinary explanations

```text
ordinary question → ONE batched Jev routing evaluation → ONE streamed text response
```

The fast lane has no tool objects, no candidate-generation loop, no specialist activation, and no final “write a JSON finish action” round trip. It authorizes a bounded text-only response envelope before generation. It does **not** claim to independently verify the final answer.

Known tool requests, fresh facts, high-stakes advice, unresolved references, verification requirements, excessive context, or `forceWork` stay on the existing full-work path. Jev can also decline the fast lane. A Jev outage fails visibly; it never silently falls through to unguided text.

Defaults: 384 output tokens for brief replies and a compact context limit of 6,000 characters. More-detail preferences increase the allowance. Streaming starts as soon as the provider supplies answer text. The adapter ignores provider reasoning fields and does not expose a private thought transcript.

The five-second first-token target is **instrumentation, not a guarantee**. Metrics include routing time, time to first token and total time. Actual latency depends on the selected model, provider and network. Model IDs are inherited from your configuration; no DeepSeek version is hard-coded.

### 5. Resident agents that sleep, and separate temporary subagents

A **resident** is your existing named agent, with its existing identity and private history. Sleeping means it has no active inference job, not that its identity is deleted. `actors.dispatch()` asks Jev to choose one allowed resident or sleep. `actors.runResident()` proposes a specific existing resident but still requires Jev authorization.

A **subagent** is a temporary worker created from an approved template. A running resident receives a short-lived `delegate` callback. Every delegated task passes another Jev gate. Authorized subagents may delegate further only within the configured depth, child-count, concurrency and shared root-attempt limits.

No heartbeat polling or model calls are made for idle residents. Existing host event queues remain responsible for retry/backpressure; this extension rejects a full concurrency budget instead of creating another scheduler or silently dropping into a different runner. The Admin agent proposes settings; the authenticated human approves and applies them.

## Integration API

```js
import { createAdaptive } from './extensions/eutrya-adaptive-extension/src/index.mjs';
import { createNativeAdapters } from './extensions/eutrya-adaptive-extension/integration/native-v02.mjs';
```

`createAdaptive` accepts your existing Jev and streaming adapters plus two swarm callbacks:

| Boundary | Add-on method or callback |
|---|---|
| Ordinary user message, before expensive planning | `replies.maybeReply({ task, context, flags, signal }, { onToken })` |
| Explicit authenticated correction | `controls.correct(principal, { text })` |
| Existing work-loop selection, after original eligibility checks | `decisions.chooseNative(baseSelection, { learningKey, continuityKey })` |
| Actual independent check of a known decision | `recordOutcome({ observationId, decisionId, passed, checker })` |
| Start a bounded swarm task with host-authorized permissions | `actors.beginRoot({ task, permissions, stateVersion })` |
| Event-driven resident selection/activation | `actors.dispatch(...)` or `actors.runResident(...)` |
| Your existing resident implementation | `swarm.runResident(request)` |
| Your existing temporary-worker implementation | `swarm.runSubagent(request)` |
| Host current-task steering | `onCorrection({ record, preferences })` |
| Shutdown | `await extension.close()` |

The complete contracts and integration sequence are in [integration/CONTRACT.md](integration/CONTRACT.md). The optional check below imports the host's real runtime and selector while keeping inference mocked:

```bash
node integration/verify-native.mjs /absolute/path/to/your/eutrya
```

## State and scope

State is stored in an atomically replaced, checksummed snapshot in a private directory. It contains feedback, bounded policy history, decision receipts, activation records and request counters. Locks prevent two processes from opening the same scope concurrently. It is not an encrypted database or an audited multi-host transaction service.

Scope includes `userId`, `workspaceId`, and `conversationId`. For personal CLI usage, choose a **stable preference-profile identifier** as conversationId, such as `cli-profile:default`, to retain learning across CLI sessions in the same workspace. Do not use a fresh random session ID for that preference profile. Share one extension owner per profile, or close and reopen it when switching the host session. Messaging deployments should use real platform/conversation/thread identities to avoid sharing private preferences between unrelated conversations.

Interrupted running jobs become `NEEDS_REVIEW`; they are not replayed on restart. A trusted owner must inspect actual host state and reconcile uncertain jobs. Profiles and subagent histories themselves remain in your existing swarm storage.

## Defaults worth tuning through Admin

| Setting | Default |
|---|---:|
| Maximum concurrent activation jobs, including waiting parents | 4 |
| Maximum subagent depth below a resident | 2 |
| Child-attempt limit per parent | 3 |
| Total activation attempts per root, including denials | 16 |
| Resident/subagent callback deadline | 120 seconds |
| Extension provider-adapter invocation cap per persistent scope | 500 |
| Stored checked outcomes | 512 |

Set longer callback deadlines for legitimate long-running host work. A parent waiting for a child still consumes a slot; configure enough slots for the desired depth or handle backpressure explicitly. The extension cap does not count hidden host retries or every request inside resident callbacks. The host's shared provider budget must still cover those. Host and extension usage displays are overlapping views of the same requests—do not add their totals together.

## Verification and limitations

See [docs/VERIFICATION.md](docs/VERIFICATION.md). The package has offline tests, a real loopback HTTP streaming test, a mock demo, and a native-runtime compatibility check. No credentials were supplied for live Jev, text-model or messaging verification. The user's newest swarm branch was not available; the callback wiring is intentionally left to the integrating agent, not claimed to be already installed.

Nothing here is an OS sandbox. In-process callbacks are trusted; an uncooperative host can ignore cancellation or bypass this add-on through a separate invocation path. The integration must remove those bypasses, retain per-tool Jev checks and existing human approvals, and never expose owner controls or verifier-result hooks as ordinary model-callable tools.
