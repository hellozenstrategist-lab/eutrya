# Messaging gateway guide · 0.2.0

All adapters are implemented as transport code around the same Eutrya runtime. Platform connectivity must be verified with your own accounts. Nothing is connected by extracting the ZIP.

## Common setup and safety

`eutrya gateway setup --platform NAME --user ID[,ID]` updates only the selected adapter in the profile's `gateway.json`. In a terminal, it also offers hidden credential prompts. `gateway template` creates an all-disabled file. Shell credentials override the profile's private `.env` file. No token value belongs in gateway JSON or a chat message.

```json
{
  "enabled": true,
  "allowedUsers": ["REPLACE_WITH_EXACT_SENDER_ID"],
  "allowedChats": [],
  "requireMention": true
}
```

An empty `allowedChats` permits the listed sender in any chat the bot can receive. Set chat IDs to restrict where it can respond. IDs are strings, never wildcard `*`. Group text needs a bot mention by default; recognized slash controls from allowlisted senders are also accepted. Bots/webhooks/self messages are filtered where platform metadata supports detection.

Use separate profiles for different bot identities, trust domains, and offline/live deployments. Do not switch the bot account or the text provider underneath a populated gateway profile. Cursors and sessions belong to the configured identity. Per-chat isolation does not make same-user filesystem access secure against approved arbitrary processes.

Each route has a dedicated workspace under `workspaceRoot`; remote users do not gain automatic access to the project opened in your CLI. CLI skills are not silently shared into messaging routes. Use local `eutrya skills install NAME FILE --route ROUTE_ID` after inspecting `gateway routes`.

## Telegram

Create a bot through Telegram's documented bot setup, obtain its token, and obtain your numeric sender ID from your own Telegram account/tools. Set `TELEGRAM_BOT_TOKEN`. Example:

```bash
eutrya gateway setup --platform telegram --user '123456789'
eutrya gateway start
```

Uses `getMe`, `getWebhookInfo`, `getUpdates`, and `sendMessage`. It refuses an already configured webhook instead of deleting it. It skips pre-existing backlog on the first polling run; subsequent cursors persist. Topic IDs are retained. Replies are plain text with previews disabled. Edited messages, arbitrary media handling, voice, and Telegram user-account automation are not implemented.

## Discord

Create/install a bot in the desired server, enable Message Content intent where required, and grant only needed channel permissions (View Channel, Send Messages, relevant thread/history access). Enable developer mode in the Discord client to copy exact sender/channel IDs using its normal UI.

Set `DISCORD_BOT_TOKEN`, then:

```bash
eutrya gateway setup --platform discord --user 'YOUR_USER_ID' --chats 'YOUR_CHANNEL_ID'
eutrya gateway start
```

The optional `discord.js` dependency is pinned to `14.22.1` for the Node 22 build target rather than following its newer major runtime requirements blindly. Gateway reconnect behavior belongs to that client library and is not independently live-tested here. Output disables mentions and suppresses embeds; the model cannot send an `@everyone` notification through rendered content. Text, DMs, and threads are normalized; interactions/buttons/voice/media are not implemented.

## Slack

Enable Socket Mode in your Slack app. Create an app-level `xapp-...` token with `connections:write` and a bot `xoxb-...` token with `chat:write` and the event/history scopes required for the conversations you select. Subscribe to `app_mention` and the relevant `message.im`, `message.channels`, or `message.groups` events; install/reinstall the app after scope changes.

Set `SLACK_APP_TOKEN` and `SLACK_BOT_TOKEN`. Use Slack member IDs such as `U...`, not display names:

```bash
eutrya gateway setup --platform slack --user 'U_REPLACE' --chats 'C_REPLACE'
eutrya gateway start
```

The app receives Socket Mode events and replies via `chat.postMessage`. Replies use plain-text blocks with unfurls disabled. Thread timestamps are retained. The socket callback acknowledges after queue acceptance. The same channel/timestamp arriving as both a message and app mention is deduplicated. Approvals are plain-text commands, not interactive Slack buttons.

## Matrix (unencrypted rooms only)

Set `MATRIX_ACCESS_TOKEN`, configure the homeserver, allowlist full user IDs and optionally room IDs. Join the bot to the intended room using your Matrix client/admin tools.

```bash
eutrya gateway setup --platform matrix --user '@you:example.org' \
  --homeserver 'https://matrix.example.org' --chats '!ROOM_ID:example.org'
```

Uses client-server `whoami`, `/sync`, room encryption state, and idempotent transaction IDs for sends. Room state indicating encryption is persisted, and sending performs a separate encryption-state check. **Encrypted rooms are unsupported, not silently downgraded.** Configure an unencrypted test room; do not try to turn off encryption in an already encrypted room. No device-key management, E2EE decryption, interactive login, or attachment support is present. Group messages need a bot mention unless locally changed. Initial backlog is skipped.

## Signal (external bridge)

Install and register/link `signal-cli-rest-api` yourself; this project neither provisions it nor obtains your phone credentials. Use its **normal/native polling mode**, not JSON-RPC/WebSocket receive mode. The bridge is a high-trust component; protect its access and use loopback or HTTPS.

```bash
eutrya gateway setup --platform signal --user '+15555550100' \
  --number '+15555550200' --bridge-url 'http://127.0.0.1:8080'
```

The allowed sender and linked bot account use E.164 strings. `SIGNAL_API_TOKEN` optionally supplies a bearer token to an operator-managed authenticated reverse proxy; it is not a standard account registration flow. Uses `/v1/receive/{number}` and `/v2/send`. **Direct text only**; group messages are ignored rather than misrouted as DMs. Delivery/receive semantics also depend on the external bridge; a bridge dequeue followed by a local crash can lose an incoming message.

## WhatsApp Business Cloud API

This is **not** personal WhatsApp QR pairing. It requires an appropriately configured Meta WhatsApp Business app, phone-number ID, API access token, app secret, verification token, and a supported Graph API version selected in your app.

```bash
eutrya gateway setup --platform whatsapp --user '15555550100' \
  --phone-id 'REPLACE_WITH_NUMERIC_PHONE_NUMBER_ID' \
  --graph-version 'REPLACE_WITH_SUPPORTED_vMAJOR.MINOR' --port 8788
```

Set `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, and `WHATSAPP_VERIFY_TOKEN`. The setup placeholders must be replaced; startup refuses an invalid Graph version or phone ID. Use the exact sender format delivered by Meta (usually digits without the leading plus).

Expose only this adapter's loopback `/whatsapp` route through your own HTTPS reverse proxy/tunnel, then configure that public callback and verification token in Meta. The server checks GET verification challenges and verifies POST `X-Hub-Signature-256` against the **raw** body before JSON parsing/processing. It filters events by phone ID. It sends only plain text through `/{version}/{phoneId}/messages`.

Only inbound text is supported. Media/status/template processing is absent. Business account restrictions, user consent, service windows, template requirements, and platform policy apply. Scheduled plain-text sends can fail outside permitted windows; no fallback template is invented. Review current Meta documentation for your account before use.

## Generic signed webhook bridge

This is a usable adapter interface, not an implementation of email, iMessage, Teams, or every other native platform. A separate bridge must translate those protocols, verify their sender identities, and hold the HMAC secret securely. Possession of this secret allows a bridge to assert sender IDs; do not distribute it to untrusted users.

```bash
eutrya gateway setup --platform webhook --user 'local-owner' --port 8787
# Supply a high-entropy secret of at least 32 characters in the shell or profile .env.
# Generate locally, for example: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
eutrya gateway start --demo
```

Use a dedicated profile for fixtures. In a second terminal with the same secret:

```bash
node examples/webhook-client.mjs send 'Try the local gateway' local-owner
node examples/webhook-client.mjs outbox
```

The signed request string is:

```text
HTTP_METHOD + "\n" + EXACT_PATH + "\n" + UNIX_TIMESTAMP_SECONDS + "\n" + RAW_BODY
```

Compute HMAC-SHA256 in lowercase hexadecimal. Headers: `X-Eutrya-Timestamp` and `X-Eutrya-Signature`. Requests outside a five-minute clock window or with altered methods, paths, or bodies are rejected. The HTTP server binds only to `127.0.0.1`; add your own authenticated/TLS-facing transport when needed.

`POST /v1/messages` accepts:

```json
{"id":"UNIQUE_EVENT_ID","userId":"local-owner","chatId":"console","threadId":"","text":"Hello","direct":true}
```

`GET /v1/outbox` returns recent messages after the same signature check. An operator-configured fixed `deliveryUrl` can receive signed outbound POSTs; it must return JSON on success. Incoming messages cannot set callback URLs. Include a unique event ID; replay detection keeps the latest 20,000 receipts. This is bounded deduplication, not permanent exactly-once processing.

## Operations and recovery

`gateway start` stays in the foreground and exits on SIGINT/SIGTERM. `gateway status` reads a persisted heartbeat with its age; it is not a live connectivity probe. `gateway routes` lists recorded route/session IDs. `gateway outbox` shows scheduled-delivery statuses. An illustrative Linux user service is included in `examples/eutrya-gateway.service`; edit its paths and review it before enabling it. It is not installed automatically.

One gateway process owns a profile. Default limits: two concurrently running routes, 32 cached open routes, 100 queued ordinary turns, 12 ordinary requests/minute/sender, and 1,000 reserved provider attempts per UTC day. Closed route sessions remain on disk. The daily limit does not combine with a separately running scheduler's independent daily limit. These are request counts, not dollar guarantees. Old disk sessions require manual retention management.

Overload rejects the turn and emits a rate-limited busy notice. `/stop` and other small controls remain available. Delivery errors do not replay model inference. `sending` outputs recovered after restart become `delivery_unknown`, requiring inspection. A running inbox turn at crash becomes `needs_review`; queued, not-yet-started turns may proceed on restart. Local transaction locks left by a hard crash fail closed and require operator inspection before removal.

Approvals default to a two-minute expiry. Each token is bound to a route and one proposed action. Other senders/chats cannot approve it. A changed runtime state invalidates the underlying decision ticket. Stopping cannot undo an already completed write or partial effects of an approved process. Neither file path checks nor remote approval prompts constitute an OS sandbox.
