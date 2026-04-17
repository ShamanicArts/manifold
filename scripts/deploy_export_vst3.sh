#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: $0 <Filter|EQ8|FX|Arp|ScaleQuantizer|Transpose|VelocityMapper|NoteFilter|bundle-path> [dest-dir]" >&2
  exit 1
fi

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
arg="$1"
dest_dir="${2:-$HOME/.vst3}"

case "$arg" in
  Filter|filter|Manifold_Filter)
    src="$repo_dir/build-dev/Manifold_Filter_artefacts/RelWithDebInfo/VST3/Manifold Filter.vst3"
    ;;
  EQ8|eq8|Manifold_EQ8)
    src="$repo_dir/build-dev/Manifold_EQ8_artefacts/RelWithDebInfo/VST3/Manifold EQ8.vst3"
    ;;
  FX|fx|Effect|effect|Manifold_FX)
    src="$repo_dir/build-dev/Manifold_FX_artefacts/RelWithDebInfo/VST3/Manifold Effect.vst3"
    ;;
  Arp|arp|Manifold_Arp)
    src="$repo_dir/build-dev/Manifold_Arp_artefacts/RelWithDebInfo/VST3/Manifold Arp.vst3"
    ;;
  ScaleQuantizer|scalequantizer|scale-quantizer|Scale-Quantizer|Manifold_ScaleQuantizer)
    src="$repo_dir/build-dev/Manifold_ScaleQuantizer_artefacts/RelWithDebInfo/VST3/Manifold Scale Quantizer.vst3"
    ;;
  Transpose|transpose|Manifold_Transpose)
    src="$repo_dir/build-dev/Manifold_Transpose_artefacts/RelWithDebInfo/VST3/Manifold Transpose.vst3"
    ;;
  VelocityMapper|velocitymapper|velocity-mapper|Velocity-Mapper|Manifold_VelocityMapper)
    src="$repo_dir/build-dev/Manifold_VelocityMapper_artefacts/RelWithDebInfo/VST3/Manifold Velocity Mapper.vst3"
    ;;
  NoteFilter|notefilter|note-filter|Note-Filter|Manifold_NoteFilter)
    src="$repo_dir/build-dev/Manifold_NoteFilter_artefacts/RelWithDebInfo/VST3/Manifold Note Filter.vst3"
    ;;
  Sample|sample|Manifold_Sample)
    src="$repo_dir/build-dev/Manifold_Sample_artefacts/RelWithDebInfo/VST3/Manifold Sample.vst3"
    ;;
  *)
    src="$arg"
    ;;
esac

if [[ ! -d "$src" ]]; then
  echo "source bundle not found: $src" >&2
  exit 1
fi

mkdir -p "$dest_dir"
rm -rf "$dest_dir/$(basename "$src")"
cp -a "$src" "$dest_dir/"
echo "deployed $(basename "$src") -> $dest_dir"
