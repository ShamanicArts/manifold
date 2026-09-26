#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cargo build --manifest-path "$repo_dir/Cargo.toml" -p manifold-web --target wasm32-unknown-unknown --release
mkdir -p "$repo_dir/web/public"
cp "$repo_dir/target/wasm32-unknown-unknown/release/manifold_web.wasm" "$repo_dir/web/public/manifold_filter.wasm"
