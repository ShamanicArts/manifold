#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
legacy_dir="${MANIFOLD_LEGACY_DIR:-$repo_dir/../my-plugin}"
mkdir -p "$repo_dir/target/legacy-reference"
binary="$repo_dir/target/legacy-reference/main-add-morph-voice-reference"
sources=("$repo_dir/tools/legacy-main-add-morph-voice-reference.cpp" "$0"
  "$legacy_dir/external/JUCE/modules/juce_core/juce_core.cpp")
for node in SampleRegionPlaybackNode OscillatorNode SineBankNode GainNode CrossfaderNode MixerNode; do
  sources+=("$legacy_dir/dsp/core/nodes/$node.cpp")
done
if [[ -f "$binary" ]]; then
  fresh=1
  for source in "${sources[@]}"; do
    if [[ "$source" -nt "$binary" ]]; then fresh=0; break; fi
  done
  if (( fresh )); then echo "$binary"; exit 0; fi
fi
mapfile -t highway_flags < <(pkg-config --cflags --libs libhwy | xargs -n1)
core_source="$legacy_dir/external/JUCE/modules/juce_core/juce_core.cpp"
core_object="$repo_dir/target/legacy-reference/juce-core-for-add-morph.o"
if [[ ! -f "$core_object" || "$core_source" -nt "$core_object" ]]; then
  c++ -std=c++17 -O2 -ffunction-sections -fdata-sections \
    -DNDEBUG=1 -D_NDEBUG=1 -DJUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1 \
    -I"$legacy_dir/external/JUCE/modules" -c "$core_source" -o "$core_object"
fi
c++ -std=c++17 -O2 -ffunction-sections -fdata-sections -Wl,--gc-sections \
  -DNDEBUG=1 -D_NDEBUG=1 -DJUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1 \
  -I"$legacy_dir" -I"$legacy_dir/external/JUCE/modules" \
  "$repo_dir/tools/legacy-main-add-morph-voice-reference.cpp" \
  "$legacy_dir/dsp/core/nodes/SampleRegionPlaybackNode.cpp" \
  "$legacy_dir/dsp/core/nodes/OscillatorNode.cpp" \
  "$legacy_dir/dsp/core/nodes/SineBankNode.cpp" \
  "$legacy_dir/dsp/core/nodes/GainNode.cpp" \
  "$legacy_dir/dsp/core/nodes/CrossfaderNode.cpp" \
  "$legacy_dir/dsp/core/nodes/MixerNode.cpp" \
  "$core_object" \
  -o "$binary" \
  "${highway_flags[@]}" -pthread -ldl -lz -lcurl
echo "$binary"
