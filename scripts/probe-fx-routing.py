#!/usr/bin/env python3
"""Measure the old FX slot's scalar Gain/Mixer routing in isolation."""
from array import array
import hashlib
import json
import math
import os
from pathlib import Path
import shlex
import subprocess

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent.parent
OLD = Path(os.environ.get("MANIFOLD_LEGACY_DIR", ROOT.parent / "my-plugin"))
OUT = ROOT / "artifacts/reviews"
BUILD = ROOT / "target/legacy-reference"
BUILD.mkdir(parents=True, exist_ok=True)
source = ROOT / "tools/legacy-fx-routing-probe.cpp"
gain = OLD / "dsp/core/nodes/GainNode.cpp"
mixer = OLD / "dsp/core/nodes/MixerNode.cpp"
lua = OLD / "UserScripts/projects/Main/lib/fx_slot.lua"
binary = BUILD / "fx-routing-probe"
data = BUILD / "fx-routing-probe.f32"
rust_data = BUILD / "fx-routing-rust.f32"
flags = shlex.split(subprocess.check_output(["pkg-config", "--cflags", "--libs", "libhwy"], text=True))
subprocess.run([
    "c++", "-std=c++17", "-O2", "-ffunction-sections", "-fdata-sections", "-Wl,--gc-sections",
    "-DNDEBUG=1", "-D_NDEBUG=1", "-DJUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1",
    f"-I{OLD}", f"-I{OLD / 'external/JUCE/modules'}", str(source), str(gain), str(mixer),
    "-o", str(binary), *flags,
], check=True)
subprocess.run([str(binary), str(data)], check=True)
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_fx_routing"], cwd=ROOT, check=True)
subprocess.run([str(ROOT / "target/debug/examples/render_fx_routing"), str(rust_data)], check=True)
samples = array("f")
samples.frombytes(data.read_bytes())
assert len(samples) == 8192 * 2
rust_samples = array("f")
rust_samples.frombytes(rust_data.read_bytes())
assert len(rust_samples) == len(samples)
gain_trace = [samples[2 * frame] / 0.8 for frame in range(8192)]
right_trace = [samples[2 * frame + 1] / 0.6 for frame in range(8192)]

# The old Gain and Mixer nodes each use the same 10 ms one-pole coefficient.
# Both centered mixer buses multiply each channel by cos(pi/4).
coefficient = max(0.0001, min(1.0, 1.0 - math.exp(-1.0 / 480.0)))
pan = math.cos(math.pi / 4)
dry, a, b, trim = 1.0, 1.0, 0.0, 0.0
model = []
for frame in range(8192):
    dry_target = 1.0 if frame < 2048 else 0.0
    a_target = 0.0 if 4096 <= frame < 6144 else 1.0
    b_target = 1.0 if 4096 <= frame < 6144 else 0.0
    trim_target = 0.0 if frame < 2048 else 1.1 if frame < 6144 and frame >= 4096 else 1.4
    dry += (dry_target - dry) * coefficient
    a += (a_target - a) * coefficient
    b += (b_target - b) * coefficient
    trim += (trim_target - trim) * coefficient
    model.append(pan * dry + pan * pan * trim * (a + b))

points = [0, 2047, 2048, 2176, 3072, 4095, 4096, 4224, 5120, 6143, 6144, 6272, 7168, 8191]
report = {
    "reference": "Original C++ scalar GainNode and MixerNode under fx_slot.lua routing; both effect outputs are identity",
    "sourceSha256": hashlib.sha256(b"".join(path.read_bytes() for path in [source, gain, mixer, lua,
        ROOT / "crates/manifold-core/src/fx_routing.rs", ROOT / "crates/manifold-core/examples/render_fx_routing.rs"])).hexdigest(),
    "sampleRate": 48000,
    "frames": 8192,
    "switchFrames": {"dryToWetA": 2048, "wetAToWetB": 4096, "wetBToWetA": 6144},
    "centerPanGain": pan,
    "drySteadyGain": pan,
    "wetASteadyGain": pan * pan * 1.4,
    "wetBSteadyGain": pan * pan * 1.1,
    "maxLeftRightNormalizedDifference": max(abs(left - right) for left, right in zip(gain_trace, right_trace)),
    "maxAnalyticalDifference": max(abs(actual - predicted) for actual, predicted in zip(gain_trace, model)),
    "maxNativeRustDifference": max(abs(old - new) for old, new in zip(samples, rust_samples)),
    "points": [{"frame": frame, "gain": round(gain_trace[frame], 8)} for frame in points],
}
if report["maxNativeRustDifference"] > 2e-6:
    raise SystemExit(f"Rust routing differs from C++ by {report['maxNativeRustDifference']}")
(OUT / "checkpoint-72-routing.json").write_text(json.dumps(report, indent=2) + "\n")

fig, ax = plt.subplots(figsize=(10, 3.5))
ax.plot([frame / 48000 for frame in range(0, 8192, 8)], gain_trace[::8], color="#6655a8", linewidth=1.8)
for frame, label in [(2048, "dry → wet A"), (4096, "A → B"), (6144, "B → A")]:
    ax.axvline(frame / 48000, color="#74848a", linestyle="--", linewidth=0.8)
    ax.text(frame / 48000 + .002, .715, label, fontsize=8, rotation=90, va="top")
for level in (pan, pan * pan * 1.4, pan * pan * 1.1):
    ax.axhline(level, color="#b3a9ce", linestyle=":" if level != pan else "-", linewidth=.8)
ax.text(.003, .738, "Steady gain: dry 0.707 · wet A 0.700 · wet B 0.550", fontsize=8, va="top")
ax.set(xlabel="Time (s)", ylabel="Output / input", xlim=(0, 8192 / 48000), ylim=(.48, .75),
       title="Old Standalone FX gain routing with identity effects")
ax.grid(axis="y", alpha=.16)
fig.tight_layout()
fig.savefig(OUT / "checkpoint-72-routing.png", dpi=160)
plt.close(fig)
print(json.dumps({key: report[key] for key in ("drySteadyGain", "wetASteadyGain", "wetBSteadyGain", "maxAnalyticalDifference", "maxNativeRustDifference")}, indent=2))
