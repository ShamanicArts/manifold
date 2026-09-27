#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo "The first VST3 bundle target is Linux x86_64." >&2
  exit 1
fi

npm --prefix "$project_root/web" run build
cargo build --manifest-path "$project_root/Cargo.toml" -p manifold-vst3 -p manifold-editor --release
bundle="$project_root/target/vst3/ManifoldFX.vst3"
mkdir -p "$bundle/Contents/x86_64-linux" "$bundle/Contents/Resources"
cp "$project_root/target/release/libmanifold_vst3.so" "$bundle/Contents/x86_64-linux/ManifoldFX.so"
cp "$project_root/target/release/manifold-editor" "$bundle/Contents/x86_64-linux/ManifoldFX-editor"
mkdir -p "$bundle/Contents/Resources/assets/assets"
cp "$project_root/web/dist/fx-module.html" "$bundle/Contents/Resources/assets/"
cp "$project_root/web/dist/graph-module.html" "$bundle/Contents/Resources/assets/"
cp -a "$project_root/web/dist/assets/." "$bundle/Contents/Resources/assets/assets/"
echo "$bundle"
