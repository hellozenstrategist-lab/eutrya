# Upstream review and adaptations

Reviewed repository: https://github.com/tamaratran/fast-jev-compaction
Pinned commit: `e3f262a7f4d42bd8dd32ced30d26176f7cb545b0` (September 17, 2026).
Source files inspected directly: `src/compact.ts`, `src/state.ts`, `src/request.ts`, `LICENSE`, README and repository tree. Source blob hashes are in `third_party/UPSTREAM.json`.

## Retained design

The upstream algorithm pairs calls/results by tool_use_id, protects first/recent messages, asks independent keep-call/keep-result questions against a shared context view, batches questions to fit limits, and applies keep / truncate-result / remove-pair decisions without rewriting retained conversational text. Its token estimator is a heuristic, not a tokenizer. This bundle adapts those ideas and portions of source into dependency-free ESM, rather than embedding the entire Claude Code plugin.

## Deliberate differences

- **Transport:** upstream uses a direct TypeSafe System One client and `noul` answers. Eutrya reuses its metered Vercel evaluation adapter and documented boolean/probability schema. No direct API key or custom HTTP inference endpoint is added.
- **Recovery:** upstream pruning text references re-running tools and its hook can fall back to a built-in summary. This bundle archives originals first, preserves existing native recall, and has no silent summary/truncation fallback. Replay of side effects is not a recovery technique.
- **Eligibility:** only reviewed read-only tool names are prunable by default; errors, pending calls, explicit evidence pins and effects are protected. Native unresolved effects block the pass.
- **Threshold:** 0.35 vs the upstream default 0.5. Lower scores are required before omission. This is a conservative policy choice, not an empirically established optimum.
- **Bounded request fan-out:** preflight batch cap, bounded concurrency, whole-pass deadline, existing host retry/billing accounting, and no partial-batch context commits.
- **Evaluator view:** includes bounded result previews (upstream normally omits result contents), plus protected task context. Four fitting stages reduce inputs/previews and abridge evaluator-view text; they do not rewrite retained output text. Protected context is not abridged. The port deliberately does not reproduce every upstream collapse/merge stage.
- **Validation:** duplicate/orphan/out-of-order tool results and inline-output ambiguity fail explicitly; probabilities must be finite and within [0,1]. Custom message/result metadata is preserved on reconstruction. Unknown content requires an explicit host adapter.
- **Host mapping:** supplied Native v0.2 observations are converted to normalized pairs and projected back. Source observations remain available through the native event archive. Work packets bypass the old recency slice/clipping only when the integration is installed.

This is a modified adaptation, not upstream bug-for-bug compatibility or upstream endorsement. The included tests were written for this port. Upstream's original test suite was not copied or run.

## Live API reference

Vercel: https://vercel.com/docs/ai-gateway/modalities/evaluation
The page documents AI SDK-only evaluation, `experimental_evaluate`, the `typesafe-ai/jev` example, boolean questions and `probability` answers. The bundle delegates the actual SDK invocation to the user's existing working adapter. Its core does not import or install `ai`.
