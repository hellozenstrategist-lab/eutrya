#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHARE="${XDG_DATA_HOME:-$HOME/.local/share}/eutrya"
RUNTIME="$SHARE/runtime"
BIN_DIR="$HOME/.local/bin"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
NODE_BIN="$(command -v node || true)"

fail() { printf '\nEutrya install: %s\n' "$*" >&2; exit 1; }

[[ -n "$NODE_BIN" ]] || fail "Node.js 22+ is required."
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
(( NODE_MAJOR >= 22 )) || fail "Node.js 22+ is required; found $(node -v)."
command -v cargo >/dev/null 2>&1 || fail "Rust/Cargo is required. Install rustup, then run this script again."

if command -v pacman >/dev/null 2>&1; then
  missing=()
  for pkg in webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module libappindicator-gtk3 librsvg xdotool; do
    pacman -Q "$pkg" >/dev/null 2>&1 || missing+=("$pkg")
  done
  if ((${#missing[@]})); then
    printf '\nMissing Tauri/Arch packages:\n  %s\n\nInstall them with:\n  sudo pacman -S --needed %s\n\n' "${missing[*]}" "${missing[*]}"
    fail "Install the missing packages and rerun."
  fi
fi

printf 'Installing Eutrya dependencies...\n'
npm --prefix "$ROOT" install

if ! command -v cargo-tauri >/dev/null 2>&1; then
  printf 'Installing Tauri CLI...\n'
  cargo install tauri-cli --version '^2'
fi

printf 'Building Eutrya desktop...\n'
(
  cd "$ROOT/desktop"
  cargo tauri build
)

mkdir -p "$RUNTIME/desktop" "$BIN_DIR" "$APP_DIR"
rm -rf "$RUNTIME/bin" "$RUNTIME/src" "$RUNTIME/extensions" "$RUNTIME/node_modules"
cp -a "$ROOT/bin" "$ROOT/src" "$ROOT/extensions" "$RUNTIME/"
cp "$ROOT/package.json" "$ROOT/scripts-check.mjs" "$ROOT/.env.example" "$RUNTIME/"
cp "$ROOT/desktop/server.mjs" "$RUNTIME/desktop/server.mjs"
cp "$ROOT/desktop/review-board.mjs" "$RUNTIME/desktop/review-board.mjs"
cp -a "$ROOT/node_modules" "$RUNTIME/node_modules"
cp "$ROOT/desktop/src-tauri/icons/icon.png" "$SHARE/icon.png"

APPIMAGE="$(find "$ROOT/desktop/src-tauri/target/release/bundle/appimage" -maxdepth 1 -type f -name '*.AppImage' -print -quit 2>/dev/null || true)"
RAW_BIN="$ROOT/desktop/src-tauri/target/release/eutrya-desktop"
if [[ -n "$APPIMAGE" ]]; then
  cp "$APPIMAGE" "$SHARE/Eutrya.AppImage"
  chmod +x "$SHARE/Eutrya.AppImage"
  GUI="$SHARE/Eutrya.AppImage"
elif [[ -x "$RAW_BIN" ]]; then
  cp "$RAW_BIN" "$SHARE/eutrya-desktop-bin"
  chmod +x "$SHARE/eutrya-desktop-bin"
  GUI="$SHARE/eutrya-desktop-bin"
else
  fail "Build completed but no Eutrya desktop executable was found."
fi

cat > "$BIN_DIR/eutrya-desktop" <<WRAPPER
#!/usr/bin/env bash
export EUTRYA_NODE="\${EUTRYA_NODE:-$NODE_BIN}"
export EUTRYA_RUNTIME_DIR="\${EUTRYA_RUNTIME_DIR:-$RUNTIME}"
exec "$GUI" "\$@"
WRAPPER
chmod +x "$BIN_DIR/eutrya-desktop"

cat > "$BIN_DIR/eutrya-cli" <<WRAPPER
#!/usr/bin/env bash
exec "$NODE_BIN" "$RUNTIME/bin/eutrya.mjs" "\$@"
WRAPPER
chmod +x "$BIN_DIR/eutrya-cli"

cat > "$APP_DIR/eutrya.desktop" <<DESKTOP
[Desktop Entry]
Name=Eutrya
Comment=Jev-native security swarm harness
Exec=${BIN_DIR}/eutrya-desktop
Icon=${SHARE}/icon.png
Terminal=false
Type=Application
Categories=Development;Utility;
StartupNotify=true
DESKTOP

printf '\nInstalled.\n\n  Existing CLI: eutrya\n  Installed CLI snapshot: eutrya-cli\n  Desktop: eutrya-desktop\n\n'
