#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-2}" cargo build --manifest-path "$repo_dir/Cargo.toml" -p manifold-ui --target wasm32-unknown-unknown --release
"${WASM_BINDGEN:-wasm-bindgen}" --target web --out-dir "$repo_dir/web/public/ui" "$repo_dir/target/wasm32-unknown-unknown/release/manifold_ui.wasm"
