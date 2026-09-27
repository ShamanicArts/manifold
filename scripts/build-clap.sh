#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cargo build --manifest-path "$project_root/Cargo.toml" -p manifold-clap --release
mkdir -p "$project_root/target/clap"

case "$(uname -s)" in
  Linux)
    cp "$project_root/target/release/libmanifold_clap.so" "$project_root/target/clap/ManifoldFX.clap"
    ;;
  Darwin)
    echo "macOS CLAP bundle packaging is not implemented yet." >&2
    exit 1
    ;;
  *)
    echo "CLAP packaging is currently supported on Linux only." >&2
    exit 1
    ;;
esac

echo "$project_root/target/clap/ManifoldFX.clap"
