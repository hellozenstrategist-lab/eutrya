# Eutrya Jev Compaction Pack · 0.1.0

**An extension for your existing Eutrya checkout, not another application or swarm.**

Jev decides which completed tool calls/results remain in active context. Retained conversation text stays verbatim. Full originals are archived before a pruning pass. There is no summarizer model, no main-model compaction call, no resident wake-up, and no silent fallback to blind truncation.

This is an Eutrya-specific adaptation of the MIT-licensed [`tamaratran/fast-jev-compaction`](https://github.com/tamaratran/fast-jev-compaction), pinned at `e3f262a7f4d42bd8dd32ced30d26176f7cb545b0`. It adapts the source algorithm; it does **not** install the upstream Claude Code plugin or require the upstream npm package. Attribution, original license, source hashes and deliberate differences are included.

## Install the bundle into the existing project

```bash
# Run from your actual Eutrya checkout. Do not replace that checkout.
mkdir -p extensions
unzip /path/to/eutrya-jev-compaction-extension-v0.1.0.zip -d extensions
cd extensions/eutrya-jev-compaction-extension
npm test
npm run check
npm run demo
```

Node.js 22+ is required. The bundle has **no new npm dependencies**. These commands do not install the extension into the host automatically. Give your coding agent **AGENT_GLUE.md**; it documents the exact seams to connect. The provided Native v0.2 patch is a reference, not a patch to force over your newer swarm implementation.

## What changes

```text
At a model-request boundary
          │
          ├── Context below trigger → zero compaction API requests
          │
          └── Context near its configured input ceiling
                        ↓
             Preserve exact originals in private archive
                        ↓
             Jev: keep this call? keep its full result?
                        ↓
             Keep exact pair / keep call + marked preview /
             remove pair from ACTIVE context
                        ↓
             Validate pairs, state revision and packet size
                        ↓
             Continue existing Eutrya loop
```

Two typed boolean questions are batched per eligible completed call. A high result-retention score keeps the call as well. A high call score with a low result score retains the call and a bounded output preview. Low scores for both remove the pair from active context. The archived original is still available.

The default retention threshold is **0.35**, more conservative than the upstream default of 0.5: more uncertain material is kept. Given the same validated probabilities and settings, the pruning policy is deterministic. Fresh Jev evaluations are not guaranteed to be identical or correct.

### Protected from this compactor

All normalized user, assistant, system and developer text is kept exactly, including order and whitespace. The first and newest six messages are protected. Native Eutrya task instructions, available directives, notebook, previous tasks, model-labelled summary and task context are not rewritten by the extension.

Only allowlisted read-only tool names are eligible by default: `read`, `list`, `search`, `recall`, `Read`, `Glob`, `Grep`. Other tools, incomplete calls, error results, explicit pins, and system/developer tool calls are protected. Pending external effects block compaction until the host reconciles them. Existing independent memory/feedback retention rules outside the compactor are unchanged.

### Archive, recall and restoration

The native adapter preserves the host's original `events.jsonl` and `store.recall('o123')`. Compaction never rewrites those original observations. The prompt includes the archive's observation-ID range, not a falsely complete list containing only recent IDs.

Before a pruning pass, the extension also writes a checksummed, content-addressed context snapshot under a private, scope-isolated directory. Truncated outputs are visibly marked as incomplete and point back to their originals. Recall originals; **do not repeat side-effecting tools to recover information**.

`extension.restore(archiveId, { operatorApproved: true })` is an API for the host's authenticated local operator UI. It merges archived original observations with later observations. It does not roll back billing, tasks, permissions, learned preferences, agent identities or execution state. This API is **not** a model-callable tool; the integration must enforce real authorization before setting the approval flag.

Archive contents are local plaintext with private permissions, not encrypted storage. Retention/cleanup is deliberately not automatic. Keep backups and implement a reviewed retention policy if disk usage grows.

## Uses your existing Vercel connection

`nativeJevAsker(runtime)` routes through:

```js
runtime.call('jev.compaction', { state, questions },
  signal => runtime.jev.evaluate(state, questions, signal), parentSignal);
```

It reuses your configured Jev model, AI SDK, Gateway credentials, cancellation, retry accounting and shared budget. It does not read or migrate credentials itself. The main AI can stay on OpenRouter, Vercel, Ollama or your other existing provider; compaction calls only Jev.

The upstream direct TypeSafe API uses `noul` questions. Vercel's current evaluation API uses `type: 'boolean'` with a returned `probability`. This bundle implements the Vercel contract, not an HTTP chat-completions substitute. It needs your **already-working** typed Jev adapter. Missing keys, unsupported SDKs and provider outages produce errors, never mock inference.

The adaptive extension's metered evaluator can also be reused through `typedJevAsker(jev)`. No changes to its learning, corrections, fast-reply lane or resident/subagent activation rules are required.

## Automatic trigger and latency

| Setting | Default | Meaning |
|---|---:|---|
| `autoTriggerRatio` | 0.72 | Start a pass above 72% of configured available context budget. |
| `targetRatio` | 0.55 | Desired post-pass size; a soft target, not forced deletion. |
| `minReductionRatio` | 0.05 | Avoid applying negligible changes, unless they resolve hard overflow. |
| `preserveRecentMessages` | 6 | Protect newest messages; in native mapping, generally three observations. |
| `callsPerBatch` | 12 | At most 12 call/result pairs per evaluation request. |
| `maxBatches` | 8 | Preflight cap on logical evaluation requests per pass. |
| `maxConcurrency` | 2 | At most two batches in flight. |
| `deadlineMs` | 20,000 | Whole evaluation-pass deadline. |
| `maxStateTokens` | 12,000 | Heuristic evaluator-state ceiling, not an exact tokenizer count. |
| `maxRequestTokens` | 16,000 | Heuristic state + questions ceiling. |
| `maxRequestChars` | 40,000 | Additional serialized-request character ceiling. |

The native bridge also measures the **actual serialized packet's character length** against the host input cap, leaving the original 7,000-character envelope reserve. With the supplied `maxPromptChars: 48000`, its packet limit is 41,000 characters. This is not a claim about a model's tokenizer or advertised context window. The host still checks the complete final request.

The engine supports a host-supplied `budget.measure(messages)` for tokenizer-based integrations. Count system prompts, tools, formatting and an output reserve in that host integration; do not treat a raw chat-body estimate as an exact all-in token count.

Small histories cause no compaction request. Identical already-evaluated contexts can be deferred until conditions change. There are no timers or autonomous background jobs in this extension. A pass can use multiple requests, and the shared state is repeated per batch. Host retries count as additional billable attempts even when the extension reports one logical batch.

**No five-second, speedup, cost-saving or accuracy claim has been established.** `elapsedMs`, request count, size changes and host provider metering expose what actually happened. A large or uncertain history may remain above the soft target; the extension will not weaken retention just to reach a percentage.

## Generic API for your newer runtime

```js
import {
  createCompactor, FileArchive, typedJevAsker,
} from './extensions/eutrya-jev-compaction-extension/src/index.mjs';

// These values come from the AUTHENTICATED HOST, not model output.
const scope = { profileId, userId, sessionId, agentId };
const archive = new FileArchive({ root: privateStateRoot, scope });
const compactor = createCompactor({
  scope, archive,
  asker: typedJevAsker(existingMeteredJevAdapter),
});
const result = await compactor.compact({
  messages: normalizedMessages,
  goal: currentTask,
  protectedContext: currentInstructionsAndUnresolvedRequirements,
  pinnedCallIds: evidenceRequiredForTheNextStep,
  budget: { limit: availablePromptCharacters },
  signal,
});
// Under the host session lock: recheck state generation, then atomically apply.
// If result.stats.hardOverflow is true, STOP: never send an oversized context.
// If result.status !== 'compacted', retain your original list.
```

This is a shape example; bind the named host variables to real interfaces. `Message` is normalized as:

```js
[
{ role: 'assistant', text: '',
  toolUses: [{ tool_use_id: 'o1', tool: 'read', input: { path: 'src/a.ts' } }] },
{ role: 'tool', text: '', toolUses: [],
  toolResults: [{ tool_use_id: 'o1', text: 'exact original output', isError: false }] }
]
```

Normalize any provider-specific content arrays and inline results before calling the engine. Do not stringify images or quietly discard unsupported message parts. Duplicate IDs, orphan results and result-before-call transcripts are rejected. Unrecognized metadata is preserved in output but is not guaranteed to be represented in the evaluator's compact state view.

## Failure behavior and limits

A provider failure, missing/malformed/out-of-range probability, timeout, cancellation, archive error or insufficient request space returns no pruned result. The original input list is not mutated. Native stale-state checks prevent applying a decision after steering or other material changes. Host requests already sent may remain billable after cancellation.

Pruning is lossy **in active context** even though kept text is verbatim and originals are archived. Jev can incorrectly assess relevance. Its evaluator sees bounded tool-result previews and may see abridged old message text; the entire original content is not always visible to it. Old removed context is not automatically reintroduced when your goal changes—use archive recall or an explicit operator restore.

If retained conversation text or protected recent results alone exceed the prompt budget, this method cannot solve that overflow. The native bridge pauses/stops the affected request with an explicit `CONTEXT_FULL` error. It does not force-cut protected data or silently invoke a summarizer. Choose a larger reviewed budget, smaller tool outputs or an explicit new-task handoff. Very large histories can also exceed the bounded batch/state/input caps before inference.

Each resident and temporary worker needs its **own session-scoped instance**. Constructing or restoring a compactor never activates an agent. The host still owns authentication, scheduling, per-session locks, approvals, execution tickets, spending limits and terminal error handling. Those systems are not replaced by this package.

## Verification

See `docs/VERIFICATION.md` for exact results. The bundle's tests are offline; the actual supplied Native v0.2 bridge is exercised with mocked inference. Your newer swarm checkout was not supplied and has not been modified or tested here. Live Vercel/Jev compatibility and quality remain unverified.
