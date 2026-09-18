# Verification record · Eutrya Jev Compaction Pack 0.1.0

## Executed in this build

Environment: Linux, Node.js 22.16.0, npm 10.9.2. No paid inference or external account changes were performed.

| Check | Actual result |
|---|---:|
| Extension core/controller/archive/adapter tests (`npm test`) | **82 passed**, 0 failed |
| Actual supplied Native v0.2 integration tests, with mock Jev inference | **19 passed**, 0 failed |
| Original Native v0.2 regression suite with extension disabled, after adding the optional seams | **179 passed**, 0 failed |
| JavaScript syntax checks | **15 modules passed** |
| Offline archive/pruning demo | Passed; exact source text and archive restoration checked |

There are **101 extension-related checks** across the standalone suite and actual-host integration suite, plus the 179 original host regressions. All were run, not inferred from source inspection. Full TAP logs are included as `test-results.tap` and `native-verification.tap`.

## What was exercised

Tests cover call/result pairing and duplicate/orphan rejection; exact conversation text retention; preservation of recent/pinned/error/non-eligible calls; call-only versus result retention; correct probability type/range checks; metadata preservation; thresholds and no-op size behavior; no-network behavior below the trigger; bounded batches/concurrency; archive-before-inference ordering; private scope separation; corruption and path checks; archive/report failures; aborts/timeouts; whole-pass rejection of malformed answers; serializability; and native/adaptive metered adapter contracts.

The actual-host suite imports the supplied v0.2 Eutrya/Store/Toolbox classes in a temporary copy. It proves that the new packet seam runs inside the real work loop; the old observation cutoff is disabled only when attached; the original `recall` still returns full evidence; calls/retries use the existing meter; manual compaction preserves task, notebook and model-labelled summary; pending effects block pruning; stale revisions/steering reject updates; native stop cancels manual compaction; protected overflow produces an explicit error; restore merges later observations without rolling back usage; hidden puzzle state is not leaked into the packet; and retained result objects are not misclassified due to JSON property-order changes.

`verify-native.mjs` applies the small reference patch only to a temporary copy. It does not modify the supplied source checkout or the user's new swarm. Original regression tests run without the extension attached, while the separate integration tests explicitly attach it.

## What this does NOT establish

- No live Jev/Vercel call was run: no provider credentials were supplied. The bridge reuses the host's typed evaluator; provider/SDK compatibility in the user's environment remains to be smoke-tested.
- The attempted documentation-SDK install in a scratch directory failed because this environment could not resolve the npm registry (`EAI_AGAIN`). The extension itself requires no new npm dependencies and all its offline checks ran without them.
- The user's newer swarm and the integration agent's future diff were not supplied or tested. Runtime identities, fast-lane context builders and new gateway/subagent factories must still be connected and checked in that checkout.
- No claims about real-model retention accuracy, reliable five-second replies, net API savings, real tokenizer counts, hardened sandboxing or production readiness are supported by these fixtures.
- Upstream fast-jev-compaction's original suite was not executed. This is an attributed modified port, not identical library compatibility.

The demo's reduction and milliseconds belong to deterministic mock inference. They demonstrate the transform and archive, not live Jev quality or throughput. A soft target can remain unmet; it is reported as such rather than forcing more deletion.

## Reproduce

```bash
npm test
npm run check
npm run demo
# Optional, with the ORIGINAL supplied Native v0.2 checkout:
npm run verify:native -- /absolute/path/to/eutrya-native-v0.2.0/eutrya
```

A fresh extraction of the distribution ZIP is also checked; its result is recorded separately in `distribution-verification.txt` alongside the release.
