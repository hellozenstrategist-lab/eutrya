# Eutrya Desktop

A free, open-source frontend for the Eutrya native swarm harness.

This project is intentionally **frontend-first**. It ships the visual system, desktop shell, interaction patterns, mock state, and adapter-friendly UI surfaces. Wire the controls to your existing Eutrya backend/runtime however you like.

## Screens included

- **Dashboard** — Admin-first chat, swarm status, system state, activity and notes
- **Swarm** — live orchestration map for Admin, Engineer, Lawyer, Finance Analyst and Researcher
- **Library** — professional swarm profiles with Jev as the native thinking layer
- **Memory** — persistent context, semantic recall and knowledge graph
- **Tools** — tool library, toolchain, execution log and provider configuration
- **Settings** — provider, swarm, profile, privacy, runtime and UI preferences

The visual system is derived from the Eutrya concept artwork: off-white technical paper, dark editorial navigation, deep navy state accents, blueprint geometry, halftone/organic motifs, and dense operator-console typography.

## Stack

- Dependency-free HTML/CSS/JavaScript frontend
- Tauri 2 desktop shell
- No framework lock-in
- No backend assumptions

## Development

The frontend is static. Open `web/index.html` directly, or serve `web/` with any local HTTP server.

## Native desktop development

On Arch / Omarchy, install Rust plus Tauri's Linux system dependencies, then:

```bash
cargo install tauri-cli --version "^2"
cargo tauri dev
```

The native shell uses a custom Eutrya titlebar with working minimize, maximize and close controls.

## Install locally as `eutrya`

After the native build prerequisites are installed:

```bash
./scripts/install-omarchy.sh
```

The script builds Eutrya and symlinks the release binary to `~/.local/bin/eutrya`, so you can launch it with:

```bash
eutrya
```

## Backend wiring

The UI is deliberately built around small adapter boundaries rather than a specific API. Replace the mock state and event handlers in `web/app.js` with your own transport layer.

A clean next step is to add `web/backend.js` with functions such as:

```js
getSwarmState()
sendMessage(agentId, message)
reloadRuntime()
getMemoryGraph()
runTool(toolId, input)
updateSettings(patch)
```

Then swap those functions into the existing click handlers without redesigning the interface.

## Concept artwork

The generated Eutrya concept images are included in `web/assets/` and used as subtle header texture/reference plates inside the UI.

## License

MIT. Keep it free, fork it, remix it, and wire it to your own runtime.
