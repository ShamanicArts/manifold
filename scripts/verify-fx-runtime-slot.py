#!/usr/bin/env python3
"""Compare native Rust host-switch slot to old C++ branch graph capture."""
from array import array
import json
import math
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "target/legacy-reference"
OLD = BUILD / "fx-runtime-switch.f32"
NEW = BUILD / "fx-tail-host-rust.f32"
if not OLD.exists():
    raise SystemExit("Run python3 scripts/probe-fx-runtime-switch.py first.")
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_fx_tail"], cwd=ROOT, check=True)
subprocess.run([str(ROOT / "target/debug/examples/render_fx_tail"), str(NEW), "--host-slot"], check=True)

def read(path):
    data = array("f")
    data.frombytes(path.read_bytes())
    if len(data) != 32768 * 2 or not all(math.isfinite(value) for value in data):
        raise SystemExit(f"Invalid capture: {path}")
    return data

old, new = read(OLD), read(NEW)
def measure(first, end):
    differences = [a - b for a, b in zip(old[first * 2:end * 2], new[first * 2:end * 2])]
    return {"max": max(map(abs, differences)),
            "rms": math.sqrt(sum(value * value for value in differences) / len(differences))}

report = {
    "reference": "Old C++ scalar FX branch GraphRuntime swaps versus native Rust host-switch EffectSlot",
    "sampleRate": 48000, "frames": 32768, "blockSize": 128,
    "whole": measure(0, 32768),
    "beforeChorus": measure(0, 8192),
    "chorus": measure(8192, 16384),
    "returnedDelay": measure(16384, 32768),
    "boundaryLeft": {str(frame): {"cpp": old[frame * 2], "rust": new[frame * 2]}
                     for frame in (8192, 16384, 17180)},
}
(ROOT / "artifacts/reviews/checkpoint-81-host-slot-metrics.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
if report["whole"]["max"] > 2e-6:
    raise SystemExit("Host-switch slot differs materially from the old C++ graph capture")
