#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
legacy_dir="${MANIFOLD_LEGACY_DIR:-$repo_dir/../my-plugin}"
if [[ ! -f "$legacy_dir/dsp/core/nodes/SineBankNode.cpp" ]]; then
  echo "Legacy SineBankNode missing: $legacy_dir" >&2
  exit 1
fi
mkdir -p "$repo_dir/target/legacy-reference"
mapfile -t hwy_flags < <(pkg-config --cflags --libs libhwy | xargs -n1)
c++ -std=c++17 -O2 -ffunction-sections -fdata-sections -Wl,--gc-sections \
  -DNDEBUG=1 -D_NDEBUG=1 -DJUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1 \
  -I"$legacy_dir" -I"$legacy_dir/external/JUCE/modules" \
  "$repo_dir/tools/legacy-spectral-target-reference.cpp" \
  "$legacy_dir/dsp/core/nodes/OscillatorNode.cpp" \
  -o "$repo_dir/target/legacy-reference/spectral-target-reference" \
  "${hwy_flags[@]}"
echo "$repo_dir/target/legacy-reference/spectral-target-reference"
