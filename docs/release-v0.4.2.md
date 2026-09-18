# Eutrya v0.4.2 — Web Capability Migration (Public Alpha)

This patch fixes upgrades from older Eutrya workspaces that persisted agent tool allowlists before live web browsing was added.

## Fixed

- Eutrya-managed legacy resident profiles now inherit the read-only `browser` capability when they already had local search access.
- Existing profile names, instructions, models and custom tool choices are preserved.
- Intentionally custom/local-only profiles are not automatically granted network access.
- The action catalog now tells agents that `browser` reads live public HTTP(S) pages and is appropriate for bounty/program pages, specifications and documentation.
- The `run` help now makes clear that approved executable+argument processes can use normal program networking, such as an operator-approved `git clone`.
- Omarchy local installation uses the raw Tauri binary path, avoiding optional AppImage/linuxdeploy packaging as a requirement.

## Upgrade behavior

The migration runs when a persisted swarm configuration is loaded and then saves the upgraded allowlist. No profile reset is required.

After updating, restart/reload Eutrya so resident runtimes are recreated with the migrated tool list.

## Security boundary

The browser capability is read-oriented and remains inside Eutrya's action/Jev selection path. Local process execution remains controlled by the existing `allowExec` setting and operator approval gate.

This remains a public-alpha developer release, not an independent security audit.
