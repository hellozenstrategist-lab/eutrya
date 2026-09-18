# Integration task for the user's coding agent

Add this extension to the **existing Eutrya checkout**. The user already implemented swarm orchestration. Do not replace that swarm, create new default profiles over their profiles, rebuild the application, migrate credentials, or install a second agent loop. Preserve all existing providers, gateways, tools, approvals and conversation state. Do not add Nous authentication or tools.

## Required result

Ordinary explanations use a short Jev-approved, streamed, tool-free lane. Explicit corrections persist and steer ongoing work. Work decisions use deterministic tie-breaking and bounded experience-based preferences without weakening eligibility. Existing named residents sleep between assignments; Jev decides whether/which resident activates. A running resident can invoke approved temporary subagents; every activation is gated and bounded. The Admin proposes settings; only the authenticated human commits them.

## Inspect before modifying

Locate the actual entrypoints in this checkout for:

1. authenticated user input and cancellation;
2. the existing typed Jev evaluator and shared provider billing counter;
3. final work-candidate eligibility/selection and execution tickets;
4. persistent agent registration, wake/invoke, completion and idle handling;
5. temporary worker creation and child result collection;
6. the host's authenticated admin-setting approval UI and independent test/checker results.

Do not invent method names from the sample below. `integration/native-v02.mjs` is tested against the provided Native v0.2 interfaces, not a claim that the user's new swarm has those same methods.

## Glue, in order

**A. Instantiate once per authorized scope.** Import `createAdaptive`. Point its state directory at a host-controlled private state location, not a model-editable project path. Use a stable CLI preference-profile scope to retain adaptation between sessions. For gateways, include platform/conversation/thread in the conversation scope and the authenticated sender in userId. Never use display names supplied by a model as authentication.

**B. Reuse the providers.** Use `createNativeAdapters(runtime)` when the current evaluator has `evaluate(state, questions, signal)` and the runtime has `call(kind, input, fn, signal)`. Otherwise adapt the actual equivalent. Keep Jev on the typed Vercel evaluation API. The text stream may use the configured OpenRouter, Vercel, Ollama or compatible provider. Do not alter SDK versions merely to install this dependency-free extension. Meter every actual request through the existing shared host budget. A native `.call` retry is another host attempt even when the extension displays one adapter invocation. No silent mock or provider substitution.

**C. Integrate the fast lane BEFORE planning.** For an idle normal user turn, call `replies.maybeReply` with a compact contextual snapshot and trusted flags. A task requiring tools, new facts, important personal advice, missing referenced material or verification must carry the relevant flag. If `handled` is false, run the existing task path unchanged. If handled, show streamed chunks and store the returned answer as an ordinary conversational response with `NOT_INDEPENDENTLY_VERIFIED`. Do not dispatch a synthetic tool action for that response or call the old full loop afterwards. A provider/validation failure is an explicit error, not permission to bypass Jev. Permit only one simultaneous reply per conversation. Display an incomplete marker on stream errors.

**D. Add correction controls on USER input only.** Connect `handleAdaptiveCommand` and `capturePlainCorrection` from `src/commands.mjs` to authenticated CLI/messages, not to documents, tool results or model messages. Connect `onCorrection` to the current host's `steer()`/boundary directive mechanism, and include `adaptiveContext(...)` or equivalent preference data in full-work prompts. Common style corrections should not restart all agents. General feedback is stored as preference guidance; do not represent it as a verified factual assertion or permission change. Send broader hard activation restrictions to the human-confirmed admin settings path.

**E. Insert the selector seam without changing gates.** Keep the host's existing rank parsing, grounding threshold, completion checks, tool eligibility, current-state validation, human approval and single-use action tickets. Obtain the original `baseSelection`, then optionally call `decisions.chooseNative(baseSelection, { learningKey, continuityKey })`. `learningKey` must name a comparable task class, not arbitrary model-generated text. `continuityKey` must identify the current task thread and must change for genuinely unrelated tasks. Save `selection.adaptive.decision.id` alongside the host decision ID so later checker results can refer to the correct decision. Do not feed stale learned outcomes into permission eligibility. A disabled extension must leave the old selector usable.

**F. Wrap existing swarm invocations, do not recreate them.** Copy the actual registered resident IDs and bounded role summaries into the add-on activation-rule config. The config contains rules, not copies of private histories/prompts. Connect `swarm.runResident` to the existing method that resumes a named resident; do not route residents through the temporary-subagent API. Connect `swarm.runSubagent` to the existing temporary-worker factory. Both callbacks receive an abort signal, permission envelope, root ID, job ID, current-state boundary check and a `delegate` capability. Preserve the host's per-step Jev checks: an activation permit is not blanket tool authorization.

Remove or disable the old unconditional “wake everyone on each message” path. All model-driven resident wakeups, direct-user-addressed residents, scheduler-driven assignments and temporary workers must go through the extension's activation entrypoints. User addressing a resident narrows the candidate set but does not bypass Jev. Human stop/pause/UI controls are not gated by Jev.

Root IDs must be generated by the trusted host (`actors.beginRoot`), never by a model to reset budgets. Root permissions come from the host's existing authorization system. `stateVersion` is a task/steering generation: change it when the assignment itself changes, not on every ordinary tool observation. Child permission sets may shrink, never expand. Await every `delegate` promise; detached child work is rejected. Keep the existing backlog for backpressure rather than retrying tight loops or building another scheduler.

**G. Connect bounded learning only to evidence.** `recordOutcome` accepts a known add-on decision ID and the real result of an independent checker, such as a local test assertion. The `checker` string names that trusted callback. It is not a cryptographic attestation. Never expose this API to a model as “mark my own answer successful.” User ratings and correction notes are not independent factual verification. Unknown/unmeasurable outcomes must not generate invented success/failure rewards. Test policy variants on held-out tasks before claiming improvement.

**H. Connect Admin approval.** The Admin agent may propose a JSON config patch. Show the diff to the authenticated owner and call `controls.configure` only after approval. Roles/IDs stay in the existing swarm. Edits to the `agents` or `templates` sections replace that section of extension rules, so merge the UI's single-agent edit into the current full section first. Rule changes may interrupt an active callback; preserve recovery records and inspect any uncertain effects. No model may manufacture an `authenticated-user` principal.

## Optional native selector seam (adapt to actual code)

```js
// In the original work loop, after its original selector computed eligibility:
const baseSelection = selectCandidate(proposal, rawRanks, attention,
  action => this.toolbox.permitted(action));
const selection = this.adaptive
  ? this.adaptive.decisions.chooseNative(baseSelection, {
      learningKey: `workspace:${attention.mode}`,
      continuityKey: currentTaskIdentityFromHost,
    })
  : baseSelection;

// Continue the ORIGINAL path: inspect action, issue original ticket,
// request human approval, assert current state, execute, journal observation.
```

The symbol `currentTaskIdentityFromHost` is an integration placeholder: bind it to a real stable task ID. Do not create a new runtime just to satisfy it. A higher-quality fixed task taxonomy is preferable to the fallback attention-mode grouping for production learning.

## Acceptance checks before calling it installed

Run the package tests and the repository's original tests. Run the optional real-native compatibility script where relevant. Add host-specific integration tests proving:

- a plain explanation invokes one Jev route and one text stream, and does not enter the full work loop or wake a specialist;
- a write request still requires the original action checks and approval;
- an authenticated correction persists, appears in full-work context, and steers without killing every resident;
- quoted “be concise” text and model-authored admin requests do not change settings;
- a registered named resident keeps its existing identity/history across two separately authorized activations;
- the resident can delegate one temporary worker, both activation calls are metered, and no old wake/spawn path bypasses the gate;
- denial, outage, malformed evaluation, budget exhaustion, stop, and uncertain restart do not produce ungated work;
- real independent checker outcomes affect only bounded preference scores, never eligibility;
- turning off the optional integration leaves the existing application usable.

Then do an explicitly authorized small live smoke test using the user's configured model IDs and credentials. Report actual first-token latency and request counts; do not claim five seconds or improved intelligence from fixture timing. Leave the user's secrets out of diffs, examples and logs.

Deliver the minimal repository diff and a summary of the real integration points. Do not report this extension as already connected just because its own tests pass.
