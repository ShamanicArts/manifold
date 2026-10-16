#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cargo build --manifest-path "$repo_dir/Cargo.toml" -p manifold-web --target wasm32-unknown-unknown --release
mkdir -p "$repo_dir/web/public"
cp "$repo_dir/target/wasm32-unknown-unknown/release/manifold_web.wasm" "$repo_dir/web/public/manifold_filter.wasm"
mkdir -p "$repo_dir/packages/manifold-author/runtime"
cp "$repo_dir/web/public/manifold_filter.wasm" "$repo_dir/packages/manifold-author/runtime/manifold_filter.wasm"
cp "$repo_dir/web/src/audio/filter-processor.js" "$repo_dir/packages/manifold-author/runtime/filter-processor.js"
