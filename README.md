# Eutrya

**A Jev-native multi-agent harness with a real desktop control surface.**

Eutrya now ships as one project: the v0.2 native runtime, adaptive layer, Jev compaction, persistent swarm, local memory, tools, scheduler, messaging gateway, and the desktop interface are fused behind a localhost-only bridge.

The project is MIT licensed and intended to stay free and forkable.

## What is fused

```text
┌────────────────────────────────────────────────────────────┐
│                    EUTRYA DESKTOP                          │
│ Dashboard · Swarm · Profiles · Memory · Tools · Settings  │
└───────────────────────┬────────────────────────────────────┘
                        │ localhost desktop bridge
                        │ approvals / state / chat / config
┌───────────────────────▼────────────────────────────────────┐
│                   EUTRYA NATIVE v0.2                      │
│ NativeSwarm · Jev · Adaptive RSI · Compaction · Tools     │
│ Memory · Shared Workspace · Scheduler · Gateway · MCP     │
└───────────────────────┬────────────────────────────────────┘
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
   Vercel/Jev      Text provider      Local tools
   evaluator       or ChatGPT         + workspace
```

The desktop is not a fake skin over mock data anymore. It reads and mutates the same `NativeSwarm`, `SharedWorkspace`, profiles, memory, permissions, model config, events, and approval gates used by the CLI.

## Desktop screens

- **Dashboard** — live swarm state, actual shared messages, runtime readiness, task counts and event feed.
- **Swarm** — persistent agents, active focus, templates, live tasks, blockers and routing state.
- **Library** — edit, add and remove real swarm profiles. Profile changes persist in the backend.
- **Memory** — search, add and forget real operator-approved persistent memory.
- **Tools** — shows tool availability from agent profiles and the backend permission model.
- **Settings** — provider/model selection, Jev key storage, runtime permissions, budgets, workspace switching and bridge restart.
- **Approvals** — writes, local commands and other gated effects appear as a native one-time approval dialog in the desktop UI.

## Runtime behavior

The existing v0.2 backend remains the authority. In particular:

- Jev still evaluates attention and candidates before tool execution.
- effectful actions still pass the state-bound decision gate;
- writes and process execution still follow backend permission policy;
- the desktop never receives API key values;
- credentials entered in Settings are stored by the backend's existing private env writer;
- the desktop bridge binds to `127.0.0.1` only;
- closing the desktop terminates its local bridge child process.

## Omarchy / Arch quick start

### 1. Install system prerequisites

Tauri 2's current Arch prerequisites are:

```bash
sudo pacman -S --needed \
  webkit2gtk-4.1 \
  base-devel \
  curl \
  wget \
  file \
  openssl \
  appmenu-gtk-module \
  libappindicator-gtk3 \
  librsvg \
  xdotool
```

You also need Node.js **22+** and Rust/Cargo.

Official Tauri prerequisites: https://v2.tauri.app/start/prerequisites/

### 2. Build + install

From the repository root:

```bash
./scripts/install-omarchy.sh
```

The installer:

1. verifies Node and the Arch dependencies;
2. installs the runtime npm dependencies (including the AI SDK used by Jev);
3. installs the Tauri CLI if necessary;
4. builds the desktop app;
5. installs a local copy under `~/.local/share/eutrya`;
6. creates two commands:

```bash
eutrya       # desktop app
eutrya-cli   # original terminal harness
```

The desktop wrapper records the absolute Node path so an Omarchy launcher does not have to guess your shell's Node installation.

## Development

### Backend tests

```bash
npm run test:runtime
```

### Desktop bridge integration test

```bash
npm run test:desktop-bridge
```

### Static checks

```bash
npm run check
```

### Desktop development

```bash
npm --prefix runtime install
cd desktop
cargo tauri dev
```

For a completely offline UI/runtime smoke test:

```bash
EUTRYA_DESKTOP_DEMO=1 cargo tauri dev
```

The demo mode is visibly marked as a fixture mode and does not silently replace missing live credentials.

## Live setup

The desktop can store the Jev/Vercel gateway credential for you in the existing Eutrya private environment file. It never reads the secret value back into the UI.

Or configure it manually:

```bash
mkdir -p ~/.config/eutrya
chmod 700 ~/.config/eutrya
printf 'AI_GATEWAY_API_KEY=%q\n' 'YOUR_KEY' > ~/.config/eutrya/.env
chmod 600 ~/.config/eutrya/.env
```

Then select your text provider and model in **Settings**.

The evaluator remains `typesafe-ai/jev`. The text model can use the backend's supported providers (`vercel`, `chatgpt`, `openrouter`, `compatible`, or `ollama`).

## Workspaces

Eutrya runs against a workspace directory. When launched from a terminal, the desktop initially uses the current directory unless `EUTRYA_WORKSPACE` is set.

You can switch workspaces from the Settings screen. The desktop restarts its bridge for the selected path; backend session state remains stored under Eutrya's normal state directories.

```bash
cd ~/code/my-project
eutrya
```

or:

```bash
EUTRYA_WORKSPACE=~/code/my-project eutrya
```

## Repository layout

```text
runtime/                         Eutrya Native v0.2 backend
  bin/eutrya.mjs                 original CLI
  src/                           runtime / providers / tools / swarm
  extensions/                    adaptive + Jev compaction extensions
  desktop/server.mjs             localhost desktop bridge
  tests/desktop-bridge.test.mjs  desktop↔runtime integration test

desktop/
  web/                           dependency-free HTML/CSS/JS frontend
  src-tauri/                     native Tauri shell + Node bridge launcher
  web/assets/                    Eutrya concept-art textures
scripts/
  install-omarchy.sh             build/install desktop + CLI wrappers
  dev-desktop.sh                 development launcher
```

## Architecture boundary

The localhost bridge exists to keep the visual layer simple and the backend authoritative.

The frontend can request operations such as:

```text
GET    /api/state
POST   /api/chat
POST   /api/focus
POST   /api/template
PATCH  /api/agents/:id
POST   /api/memory
POST   /api/approvals/:id
PATCH  /api/settings
POST   /api/credentials
POST   /api/reload
POST   /api/stop
```

The bridge does **not** create a second execution path. Chat dispatch still enters `NativeSwarm.dispatch()`, and tool effects still go through the existing runtime/toolbox/decision-gate path.

## Free and open source

MIT. Use it, fork it, change the design, build your own profiles, or wire your own model/provider stack underneath it.

The frontend concept art is included as product artwork/reference texture. The functional interface is implemented in ordinary HTML/CSS/JavaScript so contributors can modify it without adopting a frontend framework.

## License

MIT
