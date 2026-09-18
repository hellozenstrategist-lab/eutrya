#!/usr/bin/env bash
set -euo pipefail
if ! command -v cargo >/dev/null 2>&1; then
  echo "Rust is required. On Arch/Omarchy: sudo pacman -S rust cargo"
  exit 1
fi
if ! command -v cargo-tauri >/dev/null 2>&1; then
  echo "Installing Tauri CLI…"
  cargo install tauri-cli --version "^2"
fi
cargo tauri build
mkdir -p "$HOME/.local/bin"
BIN="$(find src-tauri/target/release -maxdepth 1 -type f -name 'eutrya-desktop' -print -quit)"
if [[ -z "${BIN:-}" ]]; then
  echo "Could not find the built binary. Check the Tauri build output."
  exit 1
fi
ln -sf "$(realpath "$BIN")" "$HOME/.local/bin/eutrya"
echo "Installed. Run: eutrya"
