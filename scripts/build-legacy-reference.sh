#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
legacy_dir="${MANIFOLD_LEGACY_DIR:-$repo_dir/../my-plugin}"
reference_kind="${1:-svf}"
if [[ "$reference_kind" != "svf" && "$reference_kind" != "crossfader" ]]; then
  echo "Unknown legacy reference: $reference_kind" >&2
  exit 2
fi
if [[ "$reference_kind" == "svf" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/SVFNode.cpp"
  runner_file="$repo_dir/tools/legacy-svf-reference.cpp"
else
  source_file="$legacy_dir/dsp/core/nodes/CrossfaderNode.cpp"
  runner_file="$repo_dir/tools/legacy-crossfader-reference.cpp"
fi
if [[ ! -f "$source_file" ]]; then
  echo "Legacy Manifold source missing: $source_file" >&2
  exit 1
fi
mkdir -p "$repo_dir/target/legacy-reference"
c++ -std=c++17 -O2 -DNDEBUG=1 -D_NDEBUG=1 -DJUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1 \
  -I"$legacy_dir" -I"$legacy_dir/external/JUCE/modules" \
  "$runner_file" "$source_file" \
  -o "$repo_dir/target/legacy-reference/$reference_kind-reference"
echo "$repo_dir/target/legacy-reference/$reference_kind-reference"
