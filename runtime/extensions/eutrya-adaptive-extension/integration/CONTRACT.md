# Extension / host contract

## Factory

```js
createAdaptive({
  directory, // private absolute state root chosen by the host
  scope: {userId, workspaceId, conversationId},
  config, // activation rules imported from actual host registry; see examples
  jev: {
    source: 'jev', // 'mock' requires explicit allowMocks: true
    model: configuredJevModelId,
    async evaluate({state, questions, signal}) {
      // Return {answers, usage?: {inputTokens, outputTokens, costUsd}}.
      // Use the actual existing typed Jev API; preserve metering/cancellation.
    }
  },
  async streamText({messages, maxOutputTokens, signal, onToken}) {
    // Emit only answer text through onToken; return matching {text, usage?}.
    // No tools or nested host agent may be made available here.
  },
  swarm: {
    async runResident({agentId, rootId, jobId, task, permissions,
      stateVersion, signal, delegate, assertCurrent}) {
      // Resume the existing named agent's own runtime and history.
    },
    async runSubagent({templateId, instanceId, rootId, jobId, task,
      permissions, stateVersion, signal, delegate, assertCurrent}) {
      // Create an approved temporary worker. Do not alias it to a resident.
    }
  },
  onCorrection({record, preferences}) {}, // steer current host task
  onEvent(event) {}, // optional status display; not a private reasoning stream
  allowMocks: false
});
```

This block specifies interfaces; the executable offline implementation is `examples/demo.mjs`. Do not paste empty callback bodies into a live app and claim integration.

## User authentication

Owner controls require `{kind: 'authenticated-user', id: scope.userId}` from the host's authenticated input path. This is an in-process API contract, not an authentication protocol. The model must not be able to supply that object. Do not expose controls, root creation/permission assignment, or `recordOutcome` directly as tools with model-selected arguments.

## Stream path

`replies.plan({task, context='', flags={}, signal})` returns `{route, reason, permit}`. `route` is `fast`, `work` or `clarify`. A fast permit is an opaque, process-local, single-use object, valid for 30 seconds and invalidated by relevant preference/configuration changes. No serialized token can restore it after restart. `replies.reply(permit, {onToken, signal})` consumes it and streams the approved bounded response.

`replies.maybeReply` combines these operations. A false `handled` result is a handoff to the host—not permission to execute anything. A thrown error does not authorize a fallback. It is permissible for the host's normal Jev-guided loop to handle a clarify route.

Known flags: `requiresTools`, `needsFreshFacts`, `highStakes`, `unresolvedReferences`, `requiresVerification`, `forceWork`. A true flag prevents fast routing before spending on Jev. These flags must reflect actual host knowledge; they are not a reliable safety classifier on their own. Jev also evaluates appropriateness. The fast path has no execution capabilities even if routing is semantically wrong.

Generation metrics are measured locally. `totalFirstTokenMs` includes the routing call. The target is a telemetry comparison, not a timeout or latency promise. A partial stream cannot be retracted; show it as incomplete if completion validation fails. No tool call emitted by a text provider is dispatched.

## Candidate stabilization

`decisions.choose` accepts rows `{id, strategy, action, value, eligible}` and keys `{learningKey, continuityKey}`. Values must be finite. Eligibility is required; false is never overridden. The host must compute those booleans from its original rules before calling this API.

The pure `stableSelect` function returns the chosen row, adjusted rankings, reason and input hash. The stateful `decisions.choose` also stores a decision receipt and continuity preference. Candidate order and JSON property order do not break stable ties. Receipt hashes include the relevant history state and adjusted scores.

`chooseNative` accepts the provided v0.2 `selectCandidate` result. It keeps the original row objects, eligibility and candidate payloads, and adds an `adaptive` property containing the extension decision. It does not inspect/approve/execute actions or issue the host's action ticket.

## Learning and reversibility

`recordOutcome({observationId, decisionId, passed, checker})` should be called only from a trusted checker callback. The extension validates identity, uniqueness and data shape; it does not run or authenticate your checker. The policy uses outcomes from the same `learningKey` and strategy only. It never treats the Jev probability itself as a verification result.

A smoothed signed success statistic `(successes - failures) / (samples + 2 * prior)` is multiplied by `maxLearnedBias`, after `minSamples` outcomes. There is no convergence, calibration or improvement guarantee. The retained window is finite; adaptation can be poor when task classes mix unrelated problems. Regression-test and freeze it when appropriate.

`controls.freeze(principal, true)` stops new outcome accumulation while retaining existing preferences and learned scores. `controls.resetLearning(principal)` clears checked outcomes and continuity. `controls.undoOutcome(principal, observationId)` removes one retained observation. `controls.forget(principal, feedbackId)` reconstructs preference settings from the retained correction history. Existing checked model/host decisions are never relabeled as independently verified.

## Resident activation

`actors.beginRoot({task, permissions, stateVersion})` creates a trusted bounded task. It does not activate an agent. `actors.dispatch({rootId, task, event, candidates?, principal?, signal?})` asks Jev to select one registered allowed resident or sleep. `runResident` narrows this to `agentId`. A direct authenticated request can pass `principal` for a manual-only resident; it still requires Jev.

Supported events are arbitrary configured identifiers such as `TASK_ASSIGNED`, `REVIEW_REQUIRED`, or your existing event names. No agent subscribes to all messages automatically. Idle registration does not instantiate host runtimes or make model requests.

The extension checks a validated choice distribution, a necessity boolean, and a scope boolean. These probabilities are model assessments, not calibrated proof. Deterministic rules impose enabled status, event allowlists, human-only controls and permission envelopes independently.

The approved host callback receives `delegate({templateId, task, permissions?, signal?})`. A child inherits its parent's root and may only narrow permissions. Its template must be explicitly permitted by the parent. The callback is invalid after the parent returns. Await children; detached child work triggers an incomplete/uncertain parent. Further child delegation is possible only through enabled templates and the depth limit.

Sleeping resident status here means no active invocation. It does not delete the host's resident memory or remove its registration. Active agents still run the host's normal per-step Jev and approval loop. This add-on grants permission to invoke a bounded worker, not to execute every tool it requests.

## Cancellation and recovery

Provide and obey AbortSignals in every host callback and check `assertCurrent()` at safe tool boundaries. The extension can stop awaiting an uncooperative callback but cannot terminate arbitrary in-process code or provider-side work. Such work may continue and may still be billable. Do not immediately reuse the affected workspace or root until it is reconciled.

An interrupted running callback is quarantined as `NEEDS_REVIEW`. Restart reclassifies persisted EVALUATING/RUNNING entries as uncertain. There is no automatic replay. `actors.reconcile(principal, jobId, note)` records a human inspection; it cannot infer actual effects. Closing/archiving roots requires no unresolved active or uncertain jobs.

A user style correction updates prompt preferences and host steering without revoking resident activation. Changes to the activation configuration advance a separate epoch and cancel current-scope activations. Ordinary verified-outcome learning updates do not cancel unrelated streams or working agents. Host task/steering changes use `updateRoot(rootId, stateVersion)` to invalidate an obsolete assignment; ordinary observations should continue to use the host's per-action revision checks.

## Persistence limits and ownership

One extension instance owns one scope. State writes are synchronous, bounded, checksummed and atomically replaced. The owner lock is not automatically stolen after a crash: first verify that its recorded PID is no longer active, then perform a deliberate local recovery. This is a single-process local store, not distributed locking or a transaction over external side effects.

Keep the state directory out of the model's writable tool scope. User correction text is stored verbatim locally and included in future model context; avoid secrets. There is no encryption or automatic cross-user preference sharing. Existing config is preserved on reopening; constructor config is initial configuration only. Use authenticated controls for later changes.

The rolling audit contains 256 records, decisions 512, correction history 64 (last eight notes in prompts), continuity slots 128, and checked outcomes the configured limit. At most 128 root histories can be retained before explicitly archiving closed ones. The state checksum detects accidental corruption, not an attacker who can rewrite the program and checksum.
