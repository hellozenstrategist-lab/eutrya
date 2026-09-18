# Boundaries and operational cautions

This extension changes active context, not execution authorization. It grants no tool, filesystem, network or swarm permissions. The trusted host must control adapter construction, stable identity scopes, input redaction, source snapshots, writer locks, operator approval and version checks. A caller that can modify this code or forge host identity objects can defeat these application checks.

Compaction decisions are probabilistic retention judgments, not proof of irrelevance. Tool results can contain malicious instructions; rubrics identify them as data, and deterministic pins limit what can be dropped, but this is not a formal prompt-injection defense. Verify end-task quality and pin critical evidence explicitly.

Archives contain the original supplied text in plaintext. They use private scope directories/files, checksums, regular-file checks, no-symlink directory checks and content-addressed writes. Checksums detect accidental corruption, not an attacker who can rewrite both code and files. The filesystem handling is not an audited defense against a hostile local process racing paths. Do not point the archive root into a repository writable by the model. No archive garbage collector is included.

The live adapter sends the fitted history and protected task context to the existing Jev provider. The full local archive is not uploaded wholesale, but tool previews and protected context may contain sensitive data. Do not pass API credentials or confidential material without appropriate authorization. The provider's data-retention settings remain those of the existing host adapter; this extension cannot promise zero retention.

Cancellation can stop application-level use of a result but cannot guarantee that a provider stops work or billing. Each native attempt uses the existing persisted meter and shared request pool. The logical batch cap does not replace an all-session budget or bound unknown dollar charges. No paid calls are made by npm test or npm run demo.

Native compaction changes observations and a compaction status field, increments the context revision and revokes prior execution tickets. It does not alter active permissions, pending effects, user feedback, learned policy, agent identities or billing. Manual restore must be protected by genuine host authentication; the `operatorApproved` flag is a contract with trusted code, not an authentication mechanism.
