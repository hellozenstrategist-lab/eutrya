# Eutrya Desktop

The native control surface for Eutrya Native v0.2.

The desktop frontend talks to `../runtime/desktop/server.mjs`, which exposes the existing NativeSwarm runtime over a localhost-only bridge. The UI does not implement its own agent loop or duplicate tool execution.

See the repository root README for setup and architecture details.
