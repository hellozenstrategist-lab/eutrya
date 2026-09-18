# Feature coverage: Hermes-inspired, not Hermes-complete

This release extends the attached Eutrya Native v0.1.0 implementation. It does not merge unrelated Eutrya builds, copy Hermes's runtime, or claim compatibility with all Hermes internals. The Hermes public README and messaging guide were used as a feature inventory (sources in SOURCES.md).

**Implemented** means code exists in this package and its stated behavior has local tests. It does not mean a live external integration was certified. **Partial** identifies an explicit boundary. **Not included** is not a hidden stub advertised as a working feature.

| Feature area | Status in 0.4.0 | Boundary |
| --- | --- | --- |
| Standalone CLI + one-shot mode | Implemented | Readline terminal, not full-screen TUI |
| Jev-native attention and action selection | Implemented | Model-step boundaries, not hidden token computation |
| Strategist + Jev local code-research lane | Implemented | Read-only local semantic code analysis; no compiler-grade AST guarantee or automatic vulnerability proof |
| Jev-routed security hunt Kanban | Implemented | Persistent authorized-program rules/cards; routes only to currently idle resident specialists; no claim that routing quality guarantees valid findings |
| Vercel AI Gateway | Implemented adapter | Text + separate SDK evaluation; live unverified |
| OpenRouter | Implemented text adapter | No OAuth; explicit API key |
| Local/Ollama and compatible APIs | Implemented adapter | Server/model must produce valid constrained JSON |
| Current model discovery | Implemented | Live catalogs; no guessed default text model |
| Guided onboarding and private env file | Implemented | Plaintext 0600 file; not encrypted keychain |
| Profiles | Implemented | Configuration, memory, sessions, scheduler state isolation |
| Telegram | Implemented text adapter | Bot long polling/topics; no media/voice |
| Discord | Implemented text adapter | Bot SDK; no interaction UI or voice |
| Slack | Implemented text adapter | Socket Mode; plain-text approvals |
| Matrix | Partial | Unencrypted text rooms only |
| Signal | Partial | External registered normal/native-mode bridge, DMs only |
| WhatsApp | Partial | Official Business Cloud API text; no personal QR pairing |
| Generic signed webhook | Implemented | Requires a separate bridge for a native app protocol |
| Email, SMS, Teams, LINE, Mattermost, IRC, ntfy, iMessage/BlueBubbles/Photon, Feishu/Lark, DingTalk, WeCom, Weixin, QQ/Yuanbao, Home Assistant, other Hermes gateways | Not included natively | Generic webhook is not native parity; no external bridge bundled |
| Text attachments/image/audio processing | Not included | No transcription, speech, vision, image/video generation |
| Approved persistent memory | Implemented | Bounded strings, literal search; no vector index |
| Cross-session observation/session state | Implemented | Local files, no semantic retrieval service |
| Local SKILL.md loading and drafts | Implemented/partial | Procedural Markdown only; owner review before activation |
| Automatic skill learning/rewrite/evolution | Not included | No self-installing code or unattended skill promotion |
| Remote skill marketplace/hub | Not included | Explicit local file imports |
| Persona/project instructions | Partial | Root AGENTS.md, profile SOUL.md, approved references |
| Local filesystem and process tools | Implemented | Processes need approval, not OS-sandboxed |
| Browser navigation | Implemented/partial | Bounded headless Chromium with HTTP fallback; readable page extraction, not full computer-use automation |
| MCP client | Implemented/partial | Stdio + Streamable HTTP, local sessions only; exact allowlists + approval |
| MCP resources/prompts, OAuth, sampling, elicitation, server auto-installation | Not included | No alternative agent loop through servers |
| Cron/one-shot scheduling | Implemented/partial | Single-machine serial worker, numeric five-field cron; documented missed-minute/DST semantics |
| Scheduled messaging delivery | Implemented | Existing allowlisted route, persisted claim/outbox; unknown outcomes not auto-retried |
| Parallel subtask execution | Partial | User-specified read-only batches, shared cap; no recursive delegation |
| Native multi-agent swarm | Implemented/partial | Persistent specialist profiles, shared workspace and bounded routing; not Hermes runtime parity |
| Docker/SSH/Singularity/Modal/Daytona/Vercel Sandbox backends | Not included | No sandbox is implied by approvals |
| Process persistence/pty management/background command sessions | Not included | Individual bounded local processes only |
| Session recovery and trace export | Implemented | Pending effects require inspection; no exactly-once claims |
| Provider token/cost accounting | Implemented/partial | Actual reported values; missing costs remain unknown |
| Model/provider failover and intelligent auto-routing | Not included | Text provider selected explicitly; Jev never silently replaced |
| Extension ecosystem and lifecycle hooks | Not included | Local skill references are not executable plugins |
| Native desktop UI | Implemented/partial | Tauri desktop control surface over localhost bridge; no mobile UI or full-screen terminal TUI |
| ChatGPT/Codex/Claude/Gemini subscription login | Not included | Does not scrape or reuse browser session credentials |
| Nous Portal, Nous subscription login, Nous Tool Gateway | Deliberately excluded | No Nous-specific provider/service dependencies |

Catalogs from independent gateways are returned as supplied; this release does not inspect the training provenance of every model listed by those services. Excluding Nous services does not mean relabeling or stripping attribution from third-party models.

## Practical next acceptance gates

Before calling a new native adapter production-ready, verify authentication, sender identity, scopes, reconnect, duplicate delivery, rate-limit handling, thread routing, stop/approval behavior, and real billing boundaries with a dedicated test account. Before claiming a thinking/cost improvement, run a controlled held-out-task comparison using the same text model with and without Jev, equal budgets, and independent outcome checks.
