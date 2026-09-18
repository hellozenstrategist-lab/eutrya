# Coding-agent handoff: replace Eutrya automatic compaction with Jev pruning

## Deliver a MINIMAL extension integration, not a new harness

The user already has a modified Eutrya with resident-agent swarm orchestration and an adaptive extension. Preserve that code, its resident identities/history, temporary subagents, Jev activation gates, feedback, learning, providers, gateways, tools, permissions and budgets. This bundle adds only context compaction. Do not install a Claude Code plugin, introduce Nous, request a TypeSafe direct API key, or rebuild the swarm.

Read README.md and docs/UPSTREAM.md first. The code is an attributed Eutrya port of fast-jev-compaction, using the existing typed Vercel evaluator. It is not a blindly installed upstream npm dependency.

## 1. Inspect the actual checkout before applying a patch

Find every place where context is reduced: automatic threshold handlers, the /compact command, tool-output clipping, observation-ring limits, message-window slicing, model-request construction, resident private histories and subagent handoffs. Trace full-work and adaptive fast-reply paths. A manual-command replacement alone is not success.

In the supplied Native v0.2 code, relevant seams were:

- `src/runtime.mjs`: `compact()`, `observe()` with >48 → last24 eviction, and `run()` request preparation.
- `src/memory.mjs`: `packetOf()` with last12 observations, 5,000-character clipping and additional shifting to fit.
- `bin/eutrya.mjs` and `src/gateway/router.mjs`: synchronous /compact callers that must now await and display the actual result.
- `bin/eutrya.mjs` and `src/bootstrap.mjs`: runtime factories shared by CLI/gateway/jobs/team paths.

Your later code can differ. Do not force `patches/native-v02-hooks.patch` over changed files. It is a small reference patch, tested on the supplied v0.2, and contains no replacement application. It creates seams but does not register the extension automatically.

## 2. Reuse the existing live Jev connection and metering

For the known native interfaces, use `nativeJevAsker(runtime)` / `installNativeCompaction(runtime, ...)`. It calls `runtime.call('jev.compaction', ...)` and `runtime.jev.evaluate(state, questions, signal)`.

For the adaptive pack's existing `createNativeAdapters(runtime).jev`, use `typedJevAsker(jev)`. Otherwise adapt the actual metered typed evaluator to `ask(state, questions, signal) -> { answers }`, with `source: 'jev'`.

Jev questions are `type: 'boolean'`; response items are `{ type: 'boolean', probability: number }`. Do not send upstream direct-API `noul` objects to Gateway, do not use chat completions, and do not substitute an LLM summarizer. Do not upgrade or reinstall the working SDK merely to add this dependency-free extension. Keep the host's privacy flags, timeout/retry semantics and shared provider-attempt pool. An exhausted budget must not start an unmetered request.

## 3. Establish host-owned, isolated scope and storage

Use `{profileId, userId, sessionId, agentId}` from the authenticated host. For messaging include the existing platform/chat/thread/sender routing identity as additional scope fields when applicable. A resident's own session must not use another resident's history or private archive. A temporary subagent gets its own session scope. Display names or model-generated IDs are not authentication.

Archive under a private state directory, not a model-editable workspace. The native default is `runtime.store.dir/jev-compaction/<scope-hash>/`. Do not pass credential-bearing environment/config objects in context. Reuse host redaction before normalization; this bundle deliberately does not invent secret detection.

## 4. Install at the runtime factory, not as an optional skill

For a host compatible with the reference seams:

```js
import { installNativeCompaction } from
  '../extensions/eutrya-jev-compaction-extension/integration/native-v02.mjs';

// Immediately after constructing an actual Eutrya runtime and before it can run:
const extension = installNativeCompaction(runtime, {
  scope: {
    profileId: authenticatedProfileId,
    userId: authenticatedUserId,
    sessionId: runtime.state.id,
    agentId: existingResidentOrWorkerId,
  },
  options: { autoTriggerRatio: 0.72, targetRatio: 0.55 },
});
```

Resolve the relative import from its actual host file. The identity names above are binding placeholders, not default identities. Do not create or rename agents to make the example work.

Add/port the three explicit native seams:

1. When attached, `compact()` returns `compaction.manual()`. All callers await it; report `held`, `nothing_prunable`, or errors accurately rather than claiming a successful reduction.
2. When attached, observation accumulation bypasses the old blind >48/last24 eviction. Do not erase history before the compactor sees it.
3. At the safe boundary before model requests, use `await compaction.packet(signal)` instead of the old `packetOf` pruning path, then recheck the steering boundary. The new builder measures packet size and refuses unresolved overflow.

Register in all applicable runtime factories, including resume paths. No model needs to choose a compaction skill. Retain an explicit operator-controlled disable/rollback switch; disabling is not the same as silently falling back on an error.

## 5. Newer runtime adaptation

For a different message store use `createCompactor` directly. Normalize complete tool call/result pairs with stable IDs. Preserve unsupported content as protected metadata or implement an explicit reversible adapter; never discard it because it does not fit the sample schema. Incomplete calls are not compaction candidates.

Pass available user instructions, open requirements, active feedback/constraints and needed evidence pins separately in `protectedContext` / `pinnedCallIds`. Never promote task data, logs or model text into system authority. Keep authoritative permissions, billing, RSI state, resident identities, task ledger and side-effect journal outside the mutable context list.

Supply a context measure appropriate to the actual model input, with overhead/output reserve. At commit time under the existing session lock, check that the source content/task generation is still current. A model's arrival of new instructions during compaction makes the result stale. Revoke old execution tickets if the context revision changes.

Archive exact originals before accepting a pruned list. Apply only a complete validated result; no partial batch updates. Enforce `result.stats.hardOverflow` before generating. On any failure keep originals, then pause/report using the host's existing error path. No destructive fallback is supplied.

The reference packet method is for Native v0.2 full-work calls. If the adaptive fast lane builds an independent history, connect the same context-management seam to that history without launching the full work loop or waking agents. Small tool-free replies should remain below the compaction trigger and incur zero compaction calls.

## 6. Preserve archive recovery

Keep the host's original observation/event store immutable. Ensure existing `recall` can retrieve observations whose pairs were pruned from active context; expose an ID range or index, not just retained IDs. A partial preview must be visibly incomplete and must not be validated as a complete source.

Expose `status()`, `listArchives()` or a restore UI only as deliberate host controls. `restore(...,{operatorApproved:true})` must be behind authenticated operator approval, not a model tool with a boolean it can set. Restore only conversation/observations, never meter state or permissions. Native restore merges newer observations instead of losing them.

## 7. Swarm behavior must not change

Compaction runs only inside an already-authorized agent session at a request boundary, or after an authenticated manual request. No polling interval, no new jobs, no resident wake-up, no specialist activation and no subagent creation are added. All existing Jev activation/delegation checks remain intact. A compaction failure must not silently discard another resident's memory or globally stop unrelated sessions.

## 8. Tests before claiming installed

Run package tests and syntax checks. `npm run verify:native -- /path/to/unmodified/eutrya-v0.2.0` is an optional reference verification: it copies the checkout, adds seams in the copy, runs the original regressions, and runs integration tests. It does not patch the provided path. Use your actual repository tests for the modified swarm.

Add host-specific tests proving: automatic context pressure invokes Jev without skill selection; neither old windowing path pre-discards observations; calls/results stay paired; raw retained text and relevant directives stay exact; dropped material remains recallable; all provider attempts are metered; failed/partial answers and stale generations never prune; pending effects and approvals survive; scope isolation holds across gateways/residents/children; only context data changes; restored context does not reset usage; and small fast-lane replies do not gain an extra compaction call.

Run an explicitly authorized small live smoke check through the user's existing Jev configuration. Report real request count/latency and exact retention behavior; do not infer provider compatibility or quality from mocks. Deliver the minimal integration diff and identify every bypassed old truncation seam. Do not report this bundle as already installed just because its own tests pass.
