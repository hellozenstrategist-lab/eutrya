# Upgrading the attached v0.1 build

Stop active CLI/gateway processes and back up the current configuration and session directories. Extract 0.2.0 into a new directory; do not overwrite running source files. The original v0.1 ZIP is unchanged.

Run offline tests and the demo before dependency installation. `npm install` installs/updates provider and optional integration dependencies; this build could not produce a verified lockfile because registry DNS failed. `doctor` checks local readiness. `doctor --live` makes one paid Jev request only; it does not certify all text models or messaging platforms.

Existing config fields merge with new defaults, leaving old text-model selection on Vercel unless changed. To use OpenRouter, edit `mainProvider` to `openrouter`, choose a current OpenRouter text-model ID, and supply `OPENROUTER_API_KEY`; retain `AI_GATEWAY_API_KEY` for Jev. A separate profile is preferable for a different bot account, provider family or trust domain.

New controls are stored under `dataRoot`, default `~/.local/share/eutrya`. Default configuration stays `~/.config/eutrya/config.json` and default sessions remain `~/.local/state/eutrya`. Session schema version remains 1 with additive metadata. Existing conversation sources/text may be sent to the selected providers when resumed.

Relink the binary from the new directory using `npm link`, then check `type -a eutrya`. Shell aliases, functions or older binaries can shadow it. The direct command `node /absolute/path/to/new/eutrya/bin/eutrya.mjs` is unambiguous. This release is independently implemented, not a renamed Hermes command.

No transport is auto-enabled, no messaging credentials are scraped, no scheduled daemon starts automatically, no existing gateway webhook is deleted, and no Nous-specific service is added. Review COVERAGE.md for features still absent rather than assuming a drop-in Hermes replacement.
