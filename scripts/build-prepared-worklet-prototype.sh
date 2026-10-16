#!/usr/bin/env bash
# Experimental artifact; the normal browser/native builds do not use it.
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export RUSTFLAGS='-C target-feature=+atomics,+bulk-memory,+mutable-globals -C link-arg=--shared-memory -C link-arg=--import-memory -C link-arg=--export-memory -C link-arg=--export=__wasm_init_tls -C link-arg=--export=__tls_size -C link-arg=--export=__tls_align -C link-arg=--export=__stack_pointer -C link-arg=--initial-memory=16777216 -C link-arg=--max-memory=536870912'
cargo +nightly build -Z build-std=std,panic_abort --manifest-path "$repo_dir/Cargo.toml" \
  -p manifold-web --features prepared-worklet --target wasm32-unknown-unknown --release \
  --target-dir "$repo_dir/target/prepared-worklet"
mkdir -p "$repo_dir/web/public/prepared-worklet-prototype"
cp "$repo_dir/target/prepared-worklet/wasm32-unknown-unknown/release/manifold_web.wasm" \
  "$repo_dir/web/public/prepared-worklet-prototype/manifold-prepared.wasm"
