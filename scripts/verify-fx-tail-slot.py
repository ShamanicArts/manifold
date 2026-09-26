#!/usr/bin/env python3
"""Compare the prepared persistent Rust EffectSlot with the old C++ switch fixture."""
from array import array
import json
import math
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OLD = ROOT / "target/legacy-reference/fx-tail-old.f32"
NEW = ROOT / "target/legacy-reference/fx-tail-slot.f32"
if not OLD.exists():
    raise SystemExit("Run python3 scripts/probe-fx-tail.py first.")
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_fx_tail"], cwd=ROOT, check=True)
subprocess.run([str(ROOT / "target/debug/examples/render_fx_tail"), str(NEW), "--slot"], check=True)

def read(path):
    data = array("f")
    data.frombytes(path.read_bytes())
    if len(data) != 32768 * 2:
        raise SystemExit(f"Unexpected capture size: {path}")
    return data

old, new = read(OLD), read(NEW)
differences = [a - b for a, b in zip(old, new)]
report = {
    "reference": "Old C++ scalar Chorus/Delay route versus prepared Rust EffectSlot legacy mode",
    "frames": 32768,
    "maxDifference": max(map(abs, differences)),
    "rmsDifference": math.sqrt(sum(value * value for value in differences) / len(differences)),
    "returnTailFrame": 17180,
    "returnTailSample": {"cppLeft": old[17180 * 2], "rustLeft": new[17180 * 2]},
}
(ROOT / "artifacts/reviews/checkpoint-74-native-metrics.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
if report["maxDifference"] > 2e-6:
    raise SystemExit("Persistent slot parity failed")
