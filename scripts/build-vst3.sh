#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo "The first VST3 bundle target is Linux x86_64." >&2
  exit 1
fi

cargo build --manifest-path "$project_root/Cargo.toml" -p manifold-vst3 --release
bundle="$project_root/target/vst3/ManifoldFX.vst3"
mkdir -p "$bundle/Contents/x86_64-linux" "$bundle/Contents/Resources"
cp "$project_root/target/release/libmanifold_vst3.so" "$bundle/Contents/x86_64-linux/ManifoldFX.so"
echo "$bundle"
