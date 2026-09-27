#!/usr/bin/env python3
"""Capture fixed-spectrum original Main Add/Morph routes beside the Rust bank."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get("MANIFOLD_LEGACY_DIR", ROOT.parent / "my-plugin"))
OUT = ROOT / "web/public/reference/main-add-morph-voice"
OUT.mkdir(parents=True, exist_ok=True)
legacy_runner = subprocess.check_output([str(ROOT / "scripts/build-legacy-main-add-morph-voice-reference.sh")], text=True).strip()
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_main_voice_bank",
                "--example", "emit_main_wave_recipe", "--example", "emit_main_add_source_recipe",
                "--example", "emit_main_morph_source_recipe"], cwd=ROOT, check=True)
rust_runner = ROOT / "target/debug/examples/render_main_voice_bank"
wave_runner = ROOT / "target/debug/examples/emit_main_wave_recipe"
source_runner = ROOT / "target/debug/examples/emit_main_add_source_recipe"
morph_runner = ROOT / "target/debug/examples/emit_main_morph_source_recipe"
project = json.loads((ROOT / "projects/main-voice-bank/project.json").read_text())
source_target = project["extraPartials"][0]["values"]
morph_source_target = [1, 1, 0, 0, 2.03, .38, 0, 0, 3.17, .13, 0, 0]
wave_target = [1, 1, 0, 0]
wave_targets = {waveform: [float(value) for value in subprocess.check_output(
    [wave_runner, str(waveform), "8", "0", "0", ".5"], text=True).strip().split(",")]
    for waveform in range(5)}
sample_rate, sample_frames, frames, block = 48_000, 16384, 8192, 128
with (OUT / "sample.f32").open("wb") as output:
    for index in range(sample_frames):
        phase = index / sample_rate
        left = .5 * math.sin(2 * math.pi * 220 * phase) + .15 * math.sin(2 * math.pi * 660 * phase)
        output.write(struct.pack("<ff", left, left * .8))
(OUT / "input.f32").write_bytes(bytes(frames * 8))
frequency = struct.unpack("<f", struct.pack("<f", 440 * 2 ** ((60 - 69) / 12)))[0]
extra_controls = {
    "add-stretch": (0, 0, .5, .35, 0, 1, 1, 2),
    "add-tilt-bright": (0, 0, .5, 0, 1, 1, 1, 2),
    "add-tilt-dark": (0, 0, .5, 0, 2, 1, 1, 2),
    "morph-linear-quarter": (0, 1, .5, 0, 0, .25, .6, 0),
    "morph-cosine-quarter": (0, 1, .5, 0, 0, .25, .6, 1),
    "morph-equal-quarter": (0, 1, .5, 0, 0, .25, .6, 2),
    "morph-depth-low": (0, 1, .5, 0, 0, .75, .25, 2),
    "morph-depth-full": (0, 1, .5, 0, 0, .75, 1, 2),
    "morph-stretch-bright": (0, 1, .5, .2, 1, .5, 1, 2),
}
cases = []
for case_id, mode, waveform, blend, depth, driven in [
    ("add-source", 4, 0, 1.0, .75, None),
    ("add-center", 4, 0, 0.0, .75, None),
    ("add-wave", 4, 0, -.6, .75, None),
    ("add-wave-only", 4, 0, -1.0, 1.0, None),
    ("morph-source", 5, 0, 1.0, .75, None),
    ("morph-center", 5, 0, 0.0, .75, None),
    ("add-saw-center", 4, 1, 0.0, 1.0, None),
    ("add-square-center", 4, 2, 0.0, 1.0, None),
    ("add-triangle-center", 4, 3, 0.0, 1.0, None),
    ("add-blend-center", 4, 4, 0.0, 1.0, None),
    ("add-saw-wave-only", 4, 1, -1.0, 1.0, None),
    ("add-driven-saw", 4, 0, 1.0, 1.0, (1, .5)),
    ("add-driven-pulse-narrow", 4, 0, 1.0, 1.0, (6, .18)),
    ("add-driven-pulse-half", 4, 0, 1.0, 1.0, (6, .5)),
    ("add-driven-bright", 4, 0, 1.0, 1.0, (5, .5)),
    ("add-neutral", 4, 0, 1.0, 1.0, None),
    ("add-stretch", 4, 0, 1.0, 1.0, None),
    ("add-tilt-bright", 4, 0, 1.0, 1.0, None),
    ("add-tilt-dark", 4, 0, 1.0, 1.0, None),
    ("morph-linear-quarter", 5, 1, 1.0, 1.0, None),
    ("morph-cosine-quarter", 5, 1, 1.0, 1.0, None),
    ("morph-equal-quarter", 5, 1, 1.0, 1.0, None),
    ("morph-depth-low", 5, 1, 1.0, 1.0, None),
    ("morph-depth-full", 5, 1, 1.0, 1.0, None),
    ("morph-stretch-bright", 5, 1, 1.0, 1.0, None),
]:
    old_output, rust_output = f"{case_id}-cpp.f32", f"{case_id}-rust.f32"
    params = [waveform, blend, 60, 2, 0, 0, mode, depth, .5, 0, 1,
              .001, .001, 1, .05, 1, 1, 0, .2,
              int(case_id in {"add-saw-center", "add-square-center", "add-triangle-center", "add-blend-center", "add-saw-wave-only"})]
    controls = extra_controls.get(case_id)
    case_input_target = morph_source_target if controls and mode == 5 else source_target
    case_source_target = case_input_target
    if driven:
        spectral_waveform, pulse_width = driven
        case_source_target = [float(value) for value in subprocess.check_output(
            [source_runner, str(frequency), str(spectral_waveform), str(pulse_width),
             ",".join(map(str, case_input_target))], text=True).strip().split(",")]
    elif controls and mode == 4:
        case_source_target = [float(value) for value in subprocess.check_output(
            [source_runner, str(frequency), "self", str(controls[2]),
             ",".join(map(str, case_input_target)), str(controls[3]), str(controls[4])],
            text=True).strip().split(",")]
    elif controls and mode == 5:
        case_source_target = [float(value) for value in subprocess.check_output(
            [morph_runner, str(frequency), ",".join(map(str, wave_targets[waveform])),
             ",".join(map(str, case_input_target)), str(controls[3]), str(controls[4]),
             str(controls[5]), str(controls[6]), str(controls[7])],
            text=True).strip().split(",")]
    legacy_args = [legacy_runner, str(OUT / "sample.f32"), str(OUT / old_output),
                    str(sample_frames), str(frequency), ".4", str(waveform), str(blend),
                    str(depth), str(mode), str(frames), str(block),
                    ",".join(map(str, case_input_target))]
    if controls:
        legacy_args.append(",".join(map(str, controls)))
    elif driven:
        legacy_args.append(f"1,{driven[0]},{driven[1]}")
    subprocess.run(legacy_args, check=True)
    subprocess.run([rust_runner, str(OUT / "sample.f32"), str(OUT / rust_output),
                    str(sample_rate), str(sample_rate), str(block), str(frames),
                    ",".join(map(str, params)), "0:0:0:60:127", "",
                    ",".join(map(str, wave_targets[waveform])), ",".join(map(str, case_source_target))], check=True)
    cases.append({"id": case_id, "label": f"Original Main {('Add' if mode == 4 else 'Morph')} fixed-spectrum route · blend {blend} · depth {depth}",
                  "parameters": params, "events": [[0, 0, 0, 60, 127]], "changes": [],
                  "blockSize": block, "output": rust_output, "legacyOutput": old_output,
                  "waveTarget": wave_targets[waveform], "sourceTarget": case_source_target,
                  "publishedSourceTarget": case_input_target,
                  "driven": {"waveform": driven[0], "pulseWidth": driven[1]} if driven else None,
                  "spectralControls": list(controls) if controls else None})

def digest(paths):
    return hashlib.sha256(b"".join(path.read_bytes() for path in paths)).hexdigest()

(OUT / "manifest.json").write_text(json.dumps({
    "version": 1,
    "reference": "compiled original C++ Main Add/Morph voice nodes versus native Rust Main bank",
    "scope": "old sample player, oscillator, additive sine/saw/square/triangle/blend wave recipes, SineBank spectral Add/Morph with fixed published source spectrum, driven Add flavor/pulse width, spectral stretch/tilt and Morph curve/depth, crossfaders, gains and voice mixers; temporal updates, vocoder and old UI envelope excluded",
    "legacySourceSha256": digest([LEGACY / "dsp/core/nodes" / name for name in
                                  ["SampleRegionPlaybackNode.cpp", "OscillatorNode.cpp", "SineBankNode.cpp",
                                   "GainNode.cpp", "CrossfaderNode.cpp", "MixerNode.cpp"]]),
    "referenceHarnessSha256": digest([ROOT / "tools/legacy-main-add-morph-voice-reference.cpp",
                                      ROOT / "scripts/build-legacy-main-add-morph-voice-reference.sh"]),
    "rustSourceSha256": digest([ROOT / "crates/manifold-core/src" / name for name in
                                ["main_voice_bank.rs", "sample_region.rs", "oscillator.rs", "wave_add_oscillator.rs", "sine_bank.rs", "graph.rs",
                                 "spectral_targets.rs"]] + [ROOT / "crates/manifold-core/examples/emit_main_wave_recipe.rs",
                                                            ROOT / "crates/manifold-core/examples/emit_main_add_source_recipe.rs",
                                                            ROOT / "crates/manifold-core/examples/emit_main_morph_source_recipe.rs"]),
    "wasmSha256": hashlib.sha256((ROOT / "web/public/manifold_filter.wasm").read_bytes()).hexdigest(),
    "sampleRate": sample_rate, "sampleSourceRate": sample_rate, "sampleFrames": sample_frames,
    "sample": "sample.f32", "channels": 2, "frames": frames, "stepFrame": 4096,
    "input": "input.f32", "settledStartFrame": 4096,
    "waveTarget": wave_target, "sourceTarget": source_target, "cases": cases,
}, indent=2) + "\n")
print(f"Wrote {len(cases)} compiled original Add/Morph voice and Rust cases to {OUT}")
