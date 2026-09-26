#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
legacy_dir="${MANIFOLD_LEGACY_DIR:-$repo_dir/../my-plugin}"
reference_kind="${1:-svf}"
if [[ "$reference_kind" != "svf" && "$reference_kind" != "crossfader" && "$reference_kind" != "mixer" && "$reference_kind" != "oscillator" && "$reference_kind" != "adsr" && "$reference_kind" != "noise" && "$reference_kind" != "stereo-delay" && "$reference_kind" != "reverse-delay" && "$reference_kind" != "stutter" && "$reference_kind" != "distortion" && "$reference_kind" != "spectrum-analyzer" && "$reference_kind" != "envelope-follower" && "$reference_kind" != "compressor" && "$reference_kind" != "limiter" && "$reference_kind" != "slew-audio" && "$reference_kind" != "phaser" && "$reference_kind" != "chorus" && "$reference_kind" != "eq8" && "$reference_kind" != "eq-node" && "$reference_kind" != "formant" && "$reference_kind" != "waveshaper" && "$reference_kind" != "stereo-widener" && "$reference_kind" != "filter-node" && "$reference_kind" != "reverb" && "$reference_kind" != "multitap" && "$reference_kind" != "ring-modulator" && "$reference_kind" != "transient" && "$reference_kind" != "bitcrusher" ]]; then
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
elif [[ "$reference_kind" == "reverse-delay" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/ReverseDelayNode.cpp"
  runner_file="$repo_dir/tools/legacy-reverse-delay-reference.cpp"
elif [[ "$reference_kind" == "stutter" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/StutterNode.cpp"
  runner_file="$repo_dir/tools/legacy-stutter-reference.cpp"
elif [[ "$reference_kind" == "phaser" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/PhaserNode.cpp"
  runner_file="$repo_dir/tools/legacy-phaser-reference.cpp"
elif [[ "$reference_kind" == "chorus" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/ChorusNode.cpp"
  runner_file="$repo_dir/tools/legacy-chorus-reference.cpp"
elif [[ "$reference_kind" == "eq8" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/EQ8Node.cpp"
  runner_file="$repo_dir/tools/legacy-eq8-reference.cpp"
elif [[ "$reference_kind" == "eq-node" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/EQNode.cpp"
  runner_file="$repo_dir/tools/legacy-eq-reference.cpp"
elif [[ "$reference_kind" == "formant" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/FormantFilterNode.cpp"
  runner_file="$repo_dir/tools/legacy-formant-reference.cpp"
elif [[ "$reference_kind" == "waveshaper" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/WaveShaperNode.cpp"
  runner_file="$repo_dir/tools/legacy-waveshaper-reference.cpp"
elif [[ "$reference_kind" == "stereo-widener" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/StereoWidenerNode.cpp"
  runner_file="$repo_dir/tools/legacy-stereo-widener-reference.cpp"
elif [[ "$reference_kind" == "filter-node" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/FilterNode.cpp"
  runner_file="$repo_dir/tools/legacy-filter-node-reference.cpp"
elif [[ "$reference_kind" == "reverb" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/ReverbNode.cpp"
  runner_file="$repo_dir/tools/legacy-reverb-reference.cpp"
elif [[ "$reference_kind" == "multitap" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/MultitapDelayNode.cpp"
  runner_file="$repo_dir/tools/legacy-multitap-reference.cpp"
elif [[ "$reference_kind" == "ring-modulator" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/RingModulatorNode.cpp"
  runner_file="$repo_dir/tools/legacy-ring-reference.cpp"
elif [[ "$reference_kind" == "transient" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/TransientShaperNode.cpp"
  runner_file="$repo_dir/tools/legacy-transient-reference.cpp"
elif [[ "$reference_kind" == "bitcrusher" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/BitCrusherNode.cpp"
  runner_file="$repo_dir/tools/legacy-bitcrusher-reference.cpp"
elif [[ "$reference_kind" == "spectrum-analyzer" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/SpectrumAnalyzerNode.cpp"
  runner_file="$repo_dir/tools/legacy-spectrum-analyzer-reference.cpp"
elif [[ "$reference_kind" == "envelope-follower" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/EnvelopeFollowerNode.cpp"
  runner_file="$repo_dir/tools/legacy-envelope-follower-reference.cpp"
elif [[ "$reference_kind" == "compressor" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/CompressorNode.cpp"
  runner_file="$repo_dir/tools/legacy-compressor-reference.cpp"
elif [[ "$reference_kind" == "limiter" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/LimiterNode.cpp"
  runner_file="$repo_dir/tools/legacy-limiter-reference.cpp"
elif [[ "$reference_kind" == "slew-audio" ]]; then
  source_file="$legacy_dir/dsp/core/nodes/SlewLimiterNode.cpp"
  runner_file="$repo_dir/tools/legacy-slew-reference.cpp"
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
if [[ "$reference_kind" == "mixer" || "$reference_kind" == "oscillator" || "$reference_kind" == "adsr" || "$reference_kind" == "filter-node" || "$reference_kind" == "bitcrusher" ]]; then
  mapfile -t extra_flags < <(pkg-config --cflags --libs libhwy | xargs -n1)
fi
c++ -std=c++17 -O2 -DNDEBUG=1 -D_NDEBUG=1 -DJUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1 \
  -I"$legacy_dir" -I"$legacy_dir/external/JUCE/modules" \
  "$runner_file" "$source_file" \
  -o "$repo_dir/target/legacy-reference/$reference_kind-reference" \
  "${extra_flags[@]}"
echo "$repo_dir/target/legacy-reference/$reference_kind-reference"
