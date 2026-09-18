# Eutrya Desktop

The native control surface for **Eutrya Native v0.4.0**.

The desktop frontend talks to `desktop/server.mjs`, which exposes the same root `NativeSwarm`, security profiles, shared workspace, Jev-routed hunt Kanban, memory, settings, and approval gates used by the CLI.

There is no duplicated backend under a separate runtime source tree. In development, the Tauri shell launches the repository-root runtime directly. Packaged builds bundle the current root runtime under their application resources.

The CLI remains `eutrya`. The native desktop launcher is installed as `eutrya-desktop`.

See the repository root README for setup and architecture details.
