#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
legacy_dir="${MANIFOLD_LEGACY_DIR:-$repo_dir/../my-plugin}"
reference_kind="${1:-svf}"
if [[ "$reference_kind" != "svf" && "$reference_kind" != "crossfader" && "$reference_kind" != "mixer" && "$reference_kind" != "oscillator" && "$reference_kind" != "adsr" && "$reference_kind" != "noise" && "$reference_kind" != "stereo-delay" && "$reference_kind" != "distortion" ]]; then
  echo "Unknown legacy reference: $reference_kind" >&2
  exit 2
fi
if [[ "$reference_kind" == "svf" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/SVFNode.cpp"
  runner_file="$repo_dir/tools/legacy-svf-reference.cpp"
elif [[ "$reference_kind" == "crossfader" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/CrossfaderNode.cpp"
  runner_file="$repo_dir/tools/legacy-crossfader-reference.cpp"
elif [[ "$reference_kind" == "mixer" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/MixerNode.cpp"
  runner_file="$repo_dir/tools/legacy-mixer-reference.cpp"
elif [[ "$reference_kind" == "oscillator" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/OscillatorNode.cpp"
  runner_file="$repo_dir/tools/legacy-oscillator-reference.cpp"
elif [[ "$reference_kind" == "adsr" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/ADSREnvelopeNode.cpp"
  runner_file="$repo_dir/tools/legacy-adsr-reference.cpp"
elif [[ "$reference_kind" == "noise" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/NoiseGeneratorNode.cpp"
  runner_file="$repo_dir/tools/legacy-noise-reference.cpp"
elif [[ "$reference_kind" == "stereo-delay" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/StereoDelayNode.cpp"
  runner_file="$repo_dir/tools/legacy-stereo-delay-reference.cpp"
else
  source_file="$legacy_dir/dsp/core/nodes/DistortionNode.cpp"
  runner_file="$repo_dir/tools/legacy-distortion-reference.cpp"
fi
if [[ ! -f "$source_file" ]]; then
  echo "Legacy Manifold source missing: $source_file" >&2
  exit 1
fi
mkdir -p "$repo_dir/target/legacy-reference"
extra_flags=()
if [[ "$reference_kind" == "mixer" || "$reference_kind" == "oscillator" || "$reference_kind" == "adsr" ]]; then
  mapfile -t extra_flags < <(pkg-config --cflags --libs libhwy | xargs -n1)
fi
c++ -std=c++17 -O2 -DNDEBUG=1 -D_NDEBUG=1 -DJUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1 \
  -I"$legacy_dir" -I"$legacy_dir/external/JUCE/modules" \
  "$runner_file" "$source_file" \
  -o "$repo_dir/target/legacy-reference/$reference_kind-reference" \
  "${extra_flags[@]}"
echo "$repo_dir/target/legacy-reference/$reference_kind-reference"
