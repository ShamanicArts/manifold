#!/usr/bin/env python3
"""Compare Rust graph Distortion against checked-in C++ scalar samples."""
import json
import math
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "web/public/reference/distortion"
manifest = json.loads((FIXTURES / "manifest.json").read_text())
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_distortion"], cwd=ROOT, check=True)
runner = ROOT / "target/debug/examples/render_distortion"
rendered_dir = ROOT / "target/reference-rendered/distortion"
rendered_dir.mkdir(parents=True, exist_ok=True)

def samples(path):
    raw = path.read_bytes()
    return struct.unpack(f"<{len(raw) // 4}f", raw)

failed = False
for case in manifest["cases"]:
    rendered = rendered_dir / case["output"]
    keys = ["driveBefore", "driveAfter", "mixBefore", "mixAfter", "outputBefore", "outputAfter"]
    args = [FIXTURES / manifest["input"], rendered, *(case[key] for key in keys), manifest["sampleRate"], case["blockSize"], manifest["stepFrame"], manifest["frames"]]
    subprocess.run([str(runner), *(str(arg) for arg in args)], check=True)
    legacy, rust = samples(FIXTURES / case["output"]), samples(rendered)
    if len(legacy) != len(rust): raise SystemExit(f"{case['id']}: sample count mismatch")
    differences = [abs(a - b) for a, b in zip(legacy, rust)]
    peak = max(differences)
    rms = math.sqrt(sum(value * value for value in differences) / len(differences))
    print(f"{case['id']:20s} maxAbs={peak:.8f} rmsDiff={rms:.8f}")
    failed |= not math.isfinite(peak) or peak > .0002

if failed: raise SystemExit("Distortion parity exceeds 0.0002 maximum sample error")
