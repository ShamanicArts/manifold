#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cargo run --quiet --manifest-path "$repo_dir/Cargo.toml" -p manifold-core --example export_port_catalog \
  | diff -u "$repo_dir/packages/manifold-author/catalog.generated.js" -
node "$repo_dir/scripts/generate-port-types.mjs" \
  | diff -u "$repo_dir/packages/manifold-author/catalog.generated.d.ts" -
node "$repo_dir/scripts/generate-author-definitions.mjs" --check
