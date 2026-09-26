#!/usr/bin/env python3
"""Show the deliberate Ring oscillator behavior beside the old silent FX graph."""
from array import array
import json
from pathlib import Path
import subprocess

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent.parent
build = ROOT / "target/legacy-reference"
old_path = build / "fx-ring-switch-old.f32"
prepared_path = build / "fx-ring-switch-prepared.f32"
subprocess.run(["cargo", "run", "-q", "-p", "manifold-core", "--example", "render_fx_tail",
                "--", str(prepared_path), "--prepared-ring"], cwd=ROOT, check=True)

def read(path):
    data = array("f")
    data.frombytes(path.read_bytes())
    if len(data) != 32768 * 2:
        raise RuntimeError(f"Unexpected capture length: {path}")
    return data

old = read(old_path)
prepared = read(prepared_path)
start, end = 11520, 12544
left_old = old[start * 2:end * 2:2]
left_prepared = prepared[start * 2:end * 2:2]
report = {
    "oldGraphRingPeak": max(map(abs, left_old)),
    "preparedInternalOscillatorPeak": max(map(abs, left_prepared)),
    "maximumLeftDifference": max(abs(a - b) for a, b in zip(left_old, left_prepared)),
    "frames": [start, end],
}
out = ROOT / "artifacts/reviews"
(out / "checkpoint-88-ring-choice-metrics.json").write_text(json.dumps(report, indent=2) + "\n")
fig, ax = plt.subplots(figsize=(10, 3.5), layout="constrained")
frames = range(start, end)
ax.plot(frames, left_old, label="Old C++ graph · empty B bus", color="#e2b084", lw=1.5)
ax.plot(frames, left_prepared, label="v2 prepared route · internal oscillator", color="#9a8de8", lw=1)
ax.set(xlabel="Frame at 48 kHz", ylabel="Left output", title="Ring Modulator: old slot versus audible v2 route")
ax.grid(alpha=.15)
ax.legend(loc="upper right")
fig.savefig(out / "checkpoint-88-ring-choice.png", dpi=160)
print(json.dumps(report, indent=2))
