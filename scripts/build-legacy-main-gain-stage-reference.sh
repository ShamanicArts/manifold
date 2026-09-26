#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
legacy_dir="${MANIFOLD_LEGACY_DIR:-$repo_dir/../my-plugin}"
mkdir -p "$repo_dir/target/legacy-reference"
mapfile -t highway_flags < <(pkg-config --cflags --libs libhwy | xargs -n1)
c++ -std=c++17 -O2 -ffunction-sections -fdata-sections -Wl,--gc-sections \
  -DNDEBUG=1 -D_NDEBUG=1 -DJUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1 \
  -I"$legacy_dir" -I"$legacy_dir/external/JUCE/modules" \
  "$repo_dir/tools/legacy-main-gain-stage-reference.cpp" \
  "$legacy_dir/dsp/core/nodes/GainNode.cpp" \
  "$legacy_dir/dsp/core/nodes/CrossfaderNode.cpp" \
  "$legacy_dir/dsp/core/nodes/MixerNode.cpp" \
  -o "$repo_dir/target/legacy-reference/main-gain-stage-reference" \
  "${highway_flags[@]}"
echo "$repo_dir/target/legacy-reference/main-gain-stage-reference"
