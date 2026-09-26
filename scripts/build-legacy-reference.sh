#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
legacy_dir="${MANIFOLD_LEGACY_DIR:-$repo_dir/../my-plugin}"
if [[ ! -f "$legacy_dir/dsp/core/nodes/SVFNode.cpp" ]]; then
  echo "Legacy Manifold checkout missing: $legacy_dir" >&2
  exit 1
fi
mkdir -p "$repo_dir/target/legacy-reference"
c++ -std=c++17 -O2 -DNDEBUG=1 -D_NDEBUG=1 -DJUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1 \
  -I"$legacy_dir" -I"$legacy_dir/external/JUCE/modules" \
  "$repo_dir/tools/legacy-svf-reference.cpp" \
  "$legacy_dir/dsp/core/nodes/SVFNode.cpp" \
  -o "$repo_dir/target/legacy-reference/svf-reference"
echo "$repo_dir/target/legacy-reference/svf-reference"
