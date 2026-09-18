# Working on Eutrya

Eutrya is a standalone harness. Do not convert its core into an optional skill or delegate tool execution to another agent.

Preserve the runtime ordering: evaluation for attention → bounded text proposal → independent candidate evaluation → deterministic policy → ticket and permission checks → one tool result.

There must be no normal model-triggered execution path around `Toolbox.execute` and `DecisionGate`. Adding a tool requires a strict schema, permission classification, deterministic implementation, tests, and a decision-gated execution path. Never accept shell commands or nested action batches through a generic JSON escape hatch.

Mock providers belong only to explicit demos/tests. A failed real provider must not switch silently into a heuristic or mock. Keep source labels in traces.

Do not reset the session request meter on compaction, continue, resume, or steering. Do not describe missing cost as free. Do not replace observed facts with model-generated summaries.

Journal effects before execution and record outcomes durably before clearing pending entries. Ambiguous effects must not be automatically replayed.

Keep the local process warning accurate: it is operator-approved execution, not an OS sandbox. Preserve path checks, exact file hashes, single-match edits, and data-transfer warnings.

Run `npm test` and `npm run check` before shipping a change. Both run offline without the AI SDK installed. Real-provider changes also need `doctor --live` and a small live puzzle run using authorized credentials; mock transport tests are not a substitute.

Documentation checked for the initial adapter:
- Vercel AI Gateway evaluation modality
- Vercel AI Gateway Chat Completions compatibility
- TypeSafe's typed question primitives

Consult current primary documentation before changing experimental SDK interfaces or model identifiers. Never assume a model ID from an old README is still offered.
