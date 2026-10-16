#!/usr/bin/env python3
"""Capture the old scalar FX branches through PrimitiveGraph runtime swaps."""
from array import array
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent.parent
OLD = Path(os.environ.get("MANIFOLD_LEGACY_DIR", ROOT.parent / "my-plugin"))
BUILD = ROOT / "target/legacy-reference"
BUILD.mkdir(parents=True, exist_ok=True)
source = ROOT / "tools/legacy-fx-runtime-switch.cpp"
sources = [
    source,
    OLD / "manifold/primitives/scripting/PrimitiveGraph.cpp",
    OLD / "manifold/primitives/scripting/GraphRuntime.cpp",
    *(OLD / f"dsp/core/nodes/{name}Node.cpp" for name in
      ("Passthrough", "Gain", "Mixer", "Chorus", "StereoDelay")),
]
binary = BUILD / "fx-runtime-switch"
subprocess.run([
    "c++", "-std=c++17", "-O2", "-ffunction-sections", "-fdata-sections",
    "-Wl,--gc-sections", "-DNDEBUG=1", "-D_NDEBUG=1",
    "-DJUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1", f"-I{OLD}",
    f"-I{OLD / 'external/JUCE/modules'}", *(str(path) for path in sources),
    "-o", str(binary), "-lhwy", "-pthread",
], check=True)
host_path = BUILD / "fx-runtime-switch.f32"
events = dict(line.split("=", 1) for line in subprocess.check_output([str(binary), str(host_path)], text=True).strip().splitlines())
events = {key: int(value) for key, value in events.items()}

def read(path):
    data = array("f")
    data.frombytes(path.read_bytes())
    if len(data) != 32768 * 2 or not all(math.isfinite(value) for value in data):
        raise SystemExit(f"Invalid capture: {path}")
    return data

host = read(host_path)
prepared = read(BUILD / "fx-tail-old.f32")
rust = read(BUILD / "fx-tail-slot.f32")

def distance(a, b, first, end):
    differences = [x - y for x, y in zip(a[first * 2:end * 2], b[first * 2:end * 2])]
    return {"max": max(map(abs, differences)),
            "rms": math.sqrt(sum(value * value for value in differences) / len(differences))}

segments = {}
for name, begin, end in (("beforeChorus", 0, 8192), ("chorus", 8192, 16384),
                         ("returnedDelay", 16384, 32768)):
    segments[name] = {"hostVsPrepared": distance(host, prepared, begin, end),
                      "hostVsRustSlot": distance(host, rust, begin, end)}
if segments["beforeChorus"]["hostVsPrepared"]["max"] > 1e-6:
    raise SystemExit("Graph fixture differs before the first switch")
if segments["chorus"]["hostVsPrepared"]["max"] < 0.01:
    raise SystemExit("Graph swap did not expose a gate boundary difference")

hash_paths = [*sources, OLD / "UserScripts/projects/Main/lib/fx_slot.lua",
              OLD / "UserScripts/projects/Main/lib/parameter_binder.lua"]
report = {
    "reference": "Old C++ PrimitiveGraph/GraphRuntime scalar FX branches reconstructed from fx_slot.lua",
    "sourceSha256": hashlib.sha256(b"".join(path.read_bytes() for path in hash_paths)).hexdigest(),
    "sampleRate": 48000, "frames": 32768, "blockSize": 128,
    "switches": {"firstDelay": 0, "toChorus": 8192, "backToDelay": 16384},
    "continuityTransfers": events,
    "segments": segments,
    "boundaryLeft": {str(frame): {"graph": host[frame * 2], "prepared": prepared[frame * 2],
                                 "rustSlot": rust[frame * 2]}
                     for frame in (8192, 8193, 16384, 16385, 17180)},
}
out = ROOT / "artifacts/reviews"
(out / "checkpoint-80-runtime-switch-metrics.json").write_text(json.dumps(report, indent=2) + "\n")

fig, axes = plt.subplots(2, 1, figsize=(11, 6.5), layout="constrained")
for axis, (start, end, title) in zip(axes, ((7900, 9100, "Delay → Chorus · runtime swap"),
                                              (16100, 17700, "Chorus → Delay · returning tail"))):
    step = 3
    indices = range(start, end, step)
    axis.plot(indices, [host[frame * 2] for frame in indices], label="Old C++ graph runtime", color="#e9a45e", linewidth=1.3)
    axis.plot(indices, [prepared[frame * 2] for frame in indices], label="Prepared Rust route", color="#705ab9", linewidth=1, alpha=0.8)
    axis.axvline(8192 if start < 10000 else 16384, color="#7a858f", linestyle="--", linewidth=0.8)
    axis.set_title(title, loc="left")
    axis.set_ylabel("Left output")
    axis.grid(alpha=0.15)
axes[-1].set_xlabel("Frame at 48 kHz")
axes[0].legend(loc="upper right")
fig.savefig(out / "checkpoint-80-runtime-switch.png", dpi=160)
print(json.dumps(report, indent=2))
