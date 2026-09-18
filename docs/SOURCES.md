# API and feature references

Primary documentation reviewed for this build on 2026-09-17 (America/Phoenix). Upstream pages may change. The implementation is independent; these references are not a claim of endorsement or full upstream feature parity. No Hermes or Meta sample source was copied into the implementation.

| Reference | Used for |
| --- | --- |
| https://raw.githubusercontent.com/NousResearch/hermes-agent/main/README.md | Hermes feature inventory, not runtime reuse |
| https://hermes-agent.nousresearch.com/docs/user-guide/messaging/ | Messaging breadth and coverage gaps |
| https://vercel.com/docs/ai-gateway/modalities/evaluation | SDK-only typed evaluation, Jev model ID, question/result schemas |
| https://vercel.com/docs/ai-gateway/security-and-compliance/zdr | Explicit per-request zeroDataRetention setting and plan dependence |
| https://ai-gateway.vercel.sh/v1/models | Current Gateway model catalog; no guessed model default |
| https://openrouter.ai/docs/api/reference/overview | OpenRouter Chat Completions/auth/usage shape |
| https://core.telegram.org/bots/api | Bot polling, message envelopes and send API |
| https://discord.js.org/docs/packages/discord.js/14.22.1 | Discord client/intents/events |
| https://raw.githubusercontent.com/discordjs/discord.js/14.22.1/packages/discord.js/package.json | Pinned release engine constraints |
| https://docs.slack.dev/tools/node-slack-sdk/socket-mode/ | Socket Mode client, events and acknowledgments |
| https://raw.githubusercontent.com/slackapi/node-slack-sdk/main/packages/socket-mode/README.md | App-level token and socket usage |
| https://spec.matrix.org/latest/client-server-api/ | Sync, message events and send protocol |
| https://matrix.org/docs/matrix-concepts/end-to-end-encryption/ | Reject encrypted rooms rather than downgrade |
| https://raw.githubusercontent.com/bbernhard/signal-cli-rest-api/master/README.md | External bridge deployment and operating modes |
| https://raw.githubusercontent.com/bbernhard/signal-cli-rest-api/master/doc/EXAMPLES.md | Bridge receive/send route examples |
| https://raw.githubusercontent.com/fbsamples/whatsapp-api-examples/main/README.md | Meta's Cloud API/webhook/signature example index |
| https://github.com/fbsamples/whatsapp-api-examples/tree/main/signature-validation-with-webhooks-payloads | Raw webhook payload signature validation reference |
| https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/README.md | Official MCP v1 client/transports |
| https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/package.json | MCP v1 dependency and runtime compatibility (1.30.0 at review) |
| https://modelcontextprotocol.io/specification/2025-11-25 | Protocol boundary and capability negotiation |

Some Meta developer pages and npm registry metadata were inaccessible in this environment. The Meta example index was readable; live WhatsApp behavior, account eligibility, current Graph API versions, template/service-window requirements and optional SDK installation still require verification in the deployment environment. No supported Graph version is guessed in setup.

All third-party packages retain their own licenses. Dependency installation was blocked by npm DNS resolution, so no lockfile or external-platform compatibility certification is fabricated.
