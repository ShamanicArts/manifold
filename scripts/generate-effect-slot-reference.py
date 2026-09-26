#!/usr/bin/env python3
"""Emit native Rust reference samples for supported Standalone FX type IDs."""
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web/public/reference/standalone-fx"
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_effect_slot"], cwd=ROOT, check=True)
runner = ROOT / "target/debug/examples/render_effect_slot"
sources = [ROOT / path for path in ["crates/manifold-core/src/graph.rs", "crates/manifold-core/src/effect_slot.rs", "crates/manifold-core/src/waveshaper.rs", "crates/manifold-core/src/stereo_widener.rs", "crates/manifold-core/src/legacy_filter.rs", "crates/manifold-core/src/reverb.rs", "crates/manifold-core/src/multitap_delay.rs", "crates/manifold-core/src/ring_modulator.rs", "crates/manifold-core/src/transient_shaper.rs", "crates/manifold-core/src/bitcrusher.rs", "crates/manifold-core/src/legacy_eq.rs", "crates/manifold-core/src/formant_filter.rs", "crates/manifold-core/src/reverse_delay.rs", "crates/manifold-core/src/stutter.rs", "crates/manifold-core/src/pitch_shifter.rs", "crates/manifold-core/src/stereo_delay.rs", "crates/manifold-core/src/chorus.rs", "crates/manifold-core/src/phaser.rs", "crates/manifold-core/src/compressor.rs", "crates/manifold-core/src/limiter.rs", "crates/manifold-core/src/lib.rs", "projects/standalone-fx-slice/project.json", "crates/manifold-core/examples/render_effect_slot.rs"]]
source_hash = hashlib.sha256(b"".join(path.read_bytes() for path in sources)).hexdigest()
frames, sample_rate, step = 16384, 48000, 8192
with (OUT / "input.f32").open("wb") as output:
    for frame in range(frames):
        left = .65 if frame in (0, 5400, 10700) else 0
        right = -.5 if frame in (300, 5800, 11100) else 0
        if 1500 <= frame < 4300 or 9300 <= frame < 12500:
            left += .3 * math.sin(2 * math.pi * frame * 220 / sample_rate)
            right += .24 * math.sin(2 * math.pi * frame * 330 / sample_rate)
        output.write(struct.pack("<ff", left, right))
# type, mix, p/0..p/4. Type 10 is Pitch Shift; others include Formant, EQNode, Reverse Delay, and Stutter.
specs = [
    ("pitch-semitones", "Pitch Shift semitone sweep", [10, .8, .1, .5, .2, .5, .5], [10, .8, .9, .5, .2, .5, .5], 128),
    ("pitch-window", "Pitch Shift window and feedback", [10, 1, .5, .1, .1, .5, .5], [10, 1, .5, .9, .9, .5, .5], 64),
    ("filter-to-pitch", "Switch FilterNode to Pitch Shift", [5, .8, .5, .2, .5, .5, .5], [10, .8, .8, .5, .2, .5, .5], 128),
    ("pitch-to-stutter", "Switch Pitch Shift to Stutter", [10, .8, .8, .5, .2, .5, .5], [20, .8, .05, .8, .8, .25, .5], 128),
    ("stutter-length", "Stutter beat length sweep", [20, .8, 0, .8, 1, .25, .5], [20, .8, .12, .8, 1, .25, .5], 128),
    ("stutter-gate", "Stutter gate and probability", [20, 1, .03, .2, .2, .25, .5], [20, 1, .03, .9, .9, .75, .5], 64),
    ("reverse-to-stutter", "Switch Reverse Delay to Stutter", [19, .8, .1, .25, .47, .5, .5], [20, .8, .05, .8, .8, .25, .5], 128),
    ("stutter-to-formant", "Switch Stutter to Formant", [20, .8, .05, .8, .8, .25, .5], [13, .8, .2, .5, .4, .3, .5], 128),
    ("reverse-time", "Reverse Delay time sweep", [19, .8, .03, .2, .4, .5, .5], [19, .8, .3, .2, .4, .5, .5], 128),
    ("reverse-window", "Reverse Delay window and feedback", [19, 1, .1, 0, .1, .5, .5], [19, 1, .1, .7, .9, .5, .5], 64),
    ("formant-to-reverse", "Switch Formant to Reverse Delay", [13, .8, .2, .5, .4, .3, .5], [19, .8, .1, .25, .47, .5, .5], 128),
    ("reverse-to-ring", "Switch Reverse Delay to Ring Mod", [19, .8, .1, .25, .47, .5, .5], [12, .8, .3, 1, .2, .5, .5], 128),
    ("formant-vowel", "Formant vowel sweep", [13, .8, 0, .5, .4, .3, .5], [13, .8, 1, .5, .4, .3, .5], 128),
    ("formant-drive", "Formant shift and drive", [13, 1, .3, .1, .3, .1, .5], [13, 1, .7, .9, .8, .9, .5], 64),
    ("eq-to-formant", "Switch EQ to Formant", [14, .8, .8, .2, .7, .5, .5], [13, .8, .2, .5, .4, .3, .5], 128),
    ("formant-to-ring", "Switch Formant to Ring Mod", [13, .8, .2, .5, .4, .3, .5], [12, .8, .3, 1, .2, .5, .5], 128),
    ("eq-low-high", "EQ low and high shelf sweep", [14, .9, .1, .9, .5, .5, .5], [14, .9, .9, .1, .5, .5, .5], 128),
    ("eq-mid", "EQ mid peak sweep", [14, 1, .5, .5, .1, .5, .5], [14, 1, .5, .5, .9, .5, .5], 64),
    ("filter-to-eq", "Switch FilterNode to EQ", [5, .8, .5, .2, .5, .5, .5], [14, .8, .8, .2, .7, .5, .5], 128),
    ("eq-to-reverb", "Switch EQ to Reverb", [14, .8, .8, .2, .7, .5, .5], [7, .8, .5, .4, .5, .5, .5], 128),
    ("bitcrusher-bits", "BitCrusher bit depth sweep", [17, .8, .1, .12, .55, .5, .5], [17, .8, .9, .12, .55, .5, .5], 128),
    ("bitcrusher-rate", "BitCrusher rate and output", [17, 1, .3, .05, .2, .5, .5], [17, 1, .3, .9, .9, .5, .5], 64),
    ("filter-to-bitcrusher", "Switch FilterNode to BitCrusher", [5, .8, .5, .2, .5, .5, .5], [17, .8, .3, .12, .55, .5, .5], 128),
    ("bitcrusher-to-ring", "Switch BitCrusher to Ring Mod", [17, .8, .3, .12, .55, .5, .5], [12, .8, .3, 1, .2, .5, .5], 128),
    ("transient-attack", "Transient attack sweep", [16, .8, .1, .5, .5, .5, .5], [16, .8, .9, .5, .5, .5, .5], 128),
    ("transient-sustain", "Transient sustain and sensitivity", [16, 1, .5, .1, .1, .5, .5], [16, 1, .5, .9, .9, .5, .5], 64),
    ("filter-to-transient", "Switch FilterNode to Transient", [5, .8, .5, .2, .5, .5, .5], [16, .8, .7, .3, .7, .5, .5], 128),
    ("transient-to-ring", "Switch Transient to Ring Mod", [16, .8, .7, .3, .7, .5, .5], [12, .8, .3, 1, .2, .5, .5], 128),
    ("ring-frequency", "Ring Mod frequency sweep", [12, .8, .1, 1, .2, .5, .5], [12, .8, .9, 1, .2, .5, .5], 128),
    ("ring-depth-spread", "Ring Mod depth and spread", [12, 1, .3, .2, 0, .5, .5], [12, 1, .3, 1, 1, .5, .5], 64),
    ("filter-to-ring", "Switch FilterNode to Ring Mod", [5, .8, .5, .2, .5, .5, .5], [12, .8, .3, 1, .2, .5, .5], 128),
    ("ring-to-reverb", "Switch Ring Mod to Reverb", [12, .8, .3, 1, .2, .5, .5], [7, .8, .5, .4, .5, .5, .5], 128),
    ("multitap-count", "Multitap two to eight taps", [9, 1, 0, .3, .5, .5, .5], [9, 1, 1, .3, .5, .5, .5], 128),
    ("multitap-feedback", "Multitap feedback sweep", [9, .8, .3, .1, .5, .5, .5], [9, .8, .3, .9, .5, .5, .5], 128),
    ("filter-to-multitap", "Switch FilterNode to Multitap", [5, .8, .5, .2, .5, .5, .5], [9, .8, .3, .3, .5, .5, .5], 128),
    ("multitap-to-reverb", "Switch Multitap to Reverb", [9, .8, .3, .3, .5, .5, .5], [7, .8, .5, .4, .5, .5, .5], 128),
    ("reverb-room", "Reverb room sweep", [7, 1, .1, .4, .5, .5, .5], [7, 1, .9, .4, .5, .5, .5], 128),
    ("reverb-damping", "Reverb damping sweep", [7, .8, .5, 0, .5, .5, .5], [7, .8, .5, 1, .5, .5, .5], 64),
    ("filter-to-reverb", "Switch FilterNode to Reverb", [5, .8, .5, .2, .5, .5, .5], [7, .8, .5, .4, .5, .5, .5], 128),
    ("reverb-to-delay", "Switch Reverb to Stereo Delay", [7, .8, .5, .4, .5, .5, .5], [8, .8, .1, .4, .5, .5, .5], 128),
    ("legacy-filter-cutoff", "FilterNode cutoff sweep", [5, .8, .1, .2, .5, .5, .5], [5, .8, .9, .2, .5, .5, .5], 128),
    ("legacy-filter-resonance", "FilterNode resonance sweep", [5, 1, .5, .0, .5, .5, .5], [5, 1, .5, 1.0, .5, .5, .5], 64),
    ("svf-to-legacy-filter", "Switch SVF to FilterNode", [6, .8, .5, .4, .1, .5, .5], [5, .8, .5, .2, .5, .5, .5], 128),
    ("legacy-filter-to-widener", "Switch FilterNode to StereoWidener", [5, .7, .5, .2, .5, .5, .5], [4, .7, .6, .4, .5, .5, .5], 128),
    ("widener-width", "StereoWidener width sweep", [4, .8, .3, .4, .5, .5, .5], [4, .8, .9, .4, .5, .5, .5], 128),
    ("widener-mono-low", "StereoWidener bass cutoff", [4, 1, .6, .1, .5, .5, .5], [4, 1, .6, .9, .5, .5, .5], 64),
    ("filter-to-widener", "Switch filter to StereoWidener", [6, .8, .5, .4, .1, .5, .5], [4, .8, .6, .4, .5, .5, .5], 128),
    ("widener-to-waveshaper", "Switch StereoWidener to WaveShaper", [4, .7, .6, .4, .5, .5, .5], [2, .7, .3, .0, .7, .5, .5], 128),
    ("waveshaper-drive", "WaveShaper drive and output", [2, .8, .3, 0, .7, .5, .5], [2, .8, .9, 0, .2, .5, .5], 128),
    ("waveshaper-curve", "WaveShaper tube to foldback", [2, 1, .6, .17, .7, .5, .5], [2, 1, .6, .67, .7, .5, .5], 64),
    ("waveshaper-bias", "WaveShaper bias sweep", [2, .7, .5, .33, .7, .1, .5], [2, .7, .5, .33, .7, .9, .5], 128),
    ("filter-to-waveshaper", "Switch filter to WaveShaper", [6, .8, .5, .4, .1, .5, .5], [2, .8, .3, 0, .7, .5, .5], 128),
    ("phaser-modulation", "Phaser feedback and stages", [1, .8, .25, .3, .1, .5, .4], [1, .8, .75, .9, .7, .9, .9], 128),
    ("chorus-to-phaser", "Switch chorus to phaser", [0, .8, .5, .5, .2, .6, .4], [1, .8, .5, .5, .4, .5, .4], 128),
    ("phaser-to-delay", "Switch phaser to delay", [1, .8, .5, .5, .4, .5, .4], [8, .8, .1, .4, .5, .5, .5], 64),
    ("chorus-modulation", "Chorus rate and depth", [0, .8, .25, .2, .2, .6, .4], [0, .8, .85, .9, .4, .8, .9], 128),
    ("filter-to-chorus", "Switch filter to chorus", [6, .8, .5, .4, .1, .5, .5], [0, .8, .5, .5, .2, .6, .4], 128),
    ("chorus-to-delay", "Switch chorus to delay", [0, .8, .5, .5, .2, .6, .4], [8, .8, .1, .4, .5, .5, .5], 64),
    ("dry-default", "Dry default, then wet filter", [6, 0, .5, .4, .1, .5, .5], [6, .8, .5, .4, .1, .5, .5], 128),
    ("filter-sweep", "Filter cutoff and drive", [6, .75, .25, .3, .1, .5, .5], [6, .75, .8, .7, .5, .5, .5], 128),
    ("delay-feedback", "Delay time and feedback", [8, .8, .06, .25, .5, .5, .5], [8, .8, .15, .65, .5, .5, .5], 64),
    ("filter-to-delay", "Switch filter to delay", [6, .7, .5, .4, .1, .5, .5], [8, .7, .1, .4, .5, .5, .5], 128),
    ("delay-to-filter", "Switch delay to filter", [8, .65, .09, .45, .5, .5, .5], [6, .65, .7, .25, .2, .5, .5], 128),
    ("compressor-dynamics", "Compressor threshold and ratio", [3, .8, .4, .3, .1, .3, .5], [3, .8, .1, .8, .1, .3, .5], 128),
    ("compressor-timing", "Compressor timing after prepare", [3, 1, .2, .6, .1, .3, .5], [3, 1, .2, .6, .9, .8, .5], 64),
    ("filter-to-compressor", "Switch filter to compressor", [6, .8, .5, .4, .1, .5, .5], [3, .8, .15, .75, .2, .4, .5], 128),
    ("compressor-to-delay", "Switch compressor to delay", [3, .8, .15, .75, .2, .4, .5], [8, .8, .1, .4, .5, .5, .5], 128),
    ("limiter-pre-gain", "Limiter pre gain and threshold", [15, .8, .2, .7, .4, .4, .5], [15, .8, .1, .1, .8, .4, .5], 128),
    ("limiter-soft-clip", "Limiter soft clip sweep", [15, 1, .5, .3, .4, 0, .5], [15, 1, .5, .3, .4, 1, .5], 64),
    ("filter-to-limiter", "Switch filter to limiter", [6, .8, .5, .4, .1, .5, .5], [15, .8, .2, .7, .4, .4, .5], 128),
    ("limiter-to-compressor", "Switch limiter to compressor", [15, .8, .2, .7, .4, .4, .5], [3, .8, .15, .75, .2, .4, .5], 128),
]
cases = []
for case_id, label, before, after, block in specs:
    filename = f"{case_id}.f32"
    subprocess.run([runner, str(OUT / "input.f32"), str(OUT / filename), str(sample_rate), str(block), str(step), str(frames), *(str(value) for value in before), *(str(value) for value in after)], check=True)
    cases.append({"id": case_id, "label": label, "before": before, "after": after, "blockSize": block, "output": filename})
(OUT / "manifest.json").write_text(json.dumps({
    "version": 1, "reference": "native Rust Standalone FX slot slice", "sourceSha256": source_hash,
    "sampleRate": sample_rate, "channels": 2, "frames": frames, "stepFrame": step,
    "input": "input.f32", "cases": cases,
}, indent=2) + "\n")
print(f"Wrote {len(cases)} native Rust effect-slot cases to {OUT}")
