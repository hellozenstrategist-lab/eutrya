# Security and trust boundaries

This is a developer release. Local tests are not a security audit. Use dedicated test accounts and non-confidential workspaces until the installation is reviewed.

## Jev is mandatory, not a security oracle

Every model-selected action uses the existing Eutrya proposal → evaluation → deterministic selection → state-bound single-use ticket path. Provider native tool calls, unknown actions, and mismatched tickets cannot bypass it. Jev probability does not prove an answer correct or an operation safe; independent tool permission and outcome checks remain necessary.

The new tools do not invent a second executor. MCP, memory proposals, and skill drafts use the same ticket and approval path. Human commands such as `/stop`, configuration changes, memory management, and listing status do not require a model's permission.

## Credentials and data transfer

Profile credentials are stored locally in plaintext with restrictive permissions; not encrypted. Keep the account and machine secure. No secret should be posted in chat. Imported env files are parsed as data, not executed. Existing shell variables win. Known key/token/secret values are redacted from ordinary logs/model observations where possible, but arbitrary secrets in files cannot be reliably detected. Backups preserve originals locally.

Tasks, selected source text, memories, project instructions, and tool observations can be sent to both the configured text provider and Vercel/Jev. Messaging platforms also handle conversations; MCP servers see their arguments. Review the policies and confidentiality requirements for every destination. A local text model is not a fully offline configuration when Jev remains remote.

## Messaging authorization

Disabled adapters and unknown senders are denied before inference. Explicit sender IDs are required; no wildcard/default-public mode. Restrict `allowedChats` when the same sender should not operate the bot from other locations. Sessions, memory, workspace, queues, and approvals are bound to platform/chat/thread/sender. Bots and self messages are filtered where platform identity metadata supports it.

A group reply is visible to that group. Isolation prevents accidental shared internal sessions, not channel-level privacy. A compromised allowed messaging account can request actions as that user. Only authorize accounts you control/trust. Credentials and incoming event identity are high-trust transport inputs.

The generic webhook secret authorizes an external bridge to assert identities. Validate native-platform identities at that bridge; HMAC alone cannot prove that a chat display name is genuine. The bridge server binds to loopback, requires timestamped HMAC, caps body size, and uses fixed operator-configured callbacks. A loopback listener is not an internet HTTPS endpoint until you explicitly add a protected reverse proxy/tunnel.

WhatsApp checks raw-body signatures and the selected phone ID. Matrix encrypted rooms are rejected; plaintext fallback is forbidden. The Signal bridge runs separately and must be protected by the operator.

## Side effects, tools, and files

Workspace tools reject out-of-root/private paths, common credential files, symlinks and hard links; writes recheck expected content hashes. These are not a race-proof OS sandbox. Approved processes, stdio MCP servers, and remote tool servers can have broader effects under their user/API privileges. Containers or restricted OS accounts must be configured outside this release when required.

Remote process access defaults off. When enabled by the local operator, each process still needs a route-bound approval. Tokens expire and cannot authorize a different action, sender or chat. File writes and memory/skill changes also require explicit approval. Gateway users never get a path to the CLI's active project automatically.

Skills are bounded, read-only Markdown guidance. New drafts are stored separately and not activated until reviewed. A skill/AGENTS/persona instruction cannot change the tool registry, evaluator, or approval policy. A malicious reference may still influence model proposals; treat it as untrusted input.

MCP servers require local `trusted:true` and an exact tool allowlist. Declared argument schemas are validated before calls. Server annotations such as “readOnly” do not waive approval. There is no autonomous server installation, sampling or nested agent loop. Trust the executable/URL before starting it.

## Persistence, recovery, and budgets

Session state is checksummed and atomically replaced; events are hash-linked. Someone with local write access can modify both code and logs, so this is integrity checking, not tamper-proof evidence.

Model requests reserve their attempt budget before dispatch. Shared gateway/scheduler/team caps supplement per-session caps. Unknown cost stays unpriced; dollar settings are not strict all-in spending limits. Provider work can continue or be billed after local cancellation.

Effects are journaled before execution. Uncertain effects require operator reconciliation. Interrupted running gateway turns/jobs are not automatically replayed. Outputs claimed before sending may become `delivery_unknown`; inspect instead of assuming either failure or success. Deduplication is bounded, not exactly-once delivery. External bridges/platforms may lose or redeliver messages, especially on overload, reconnect, or process crashes.

Local state lock files left after a hard interruption intentionally fail closed. Verify that no live process owns them and inspect state before removing a stale transaction lock. Do not run multiple daemon processes against the same profile. Back up state and manage retention manually; no automatic deletion/cleanup of old sessions is included.
