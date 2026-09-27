#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
npm --prefix "$project_root/web" run build
cargo build --manifest-path "$project_root/Cargo.toml" -p manifold-clap -p manifold-editor --release
mkdir -p "$project_root/target/clap"

case "$(uname -s)" in
  Linux)
    cp "$project_root/target/release/libmanifold_clap.so" "$project_root/target/clap/ManifoldFX.clap"
    cp "$project_root/target/release/manifold-editor" "$project_root/target/clap/ManifoldFX-editor"
    mkdir -p "$project_root/target/clap/assets/assets"
    cp "$project_root/web/dist/fx-module.html" "$project_root/target/clap/assets/"
    cp "$project_root/web/dist/graph-module.html" "$project_root/target/clap/assets/"
    cp -a "$project_root/web/dist/assets/." "$project_root/target/clap/assets/assets/"
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
