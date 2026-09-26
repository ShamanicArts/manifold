#!/usr/bin/env python3
"""Compare the Rust graph Crossfader with checked-in C++ samples."""
import json
import math
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "web/public/reference/crossfader"
manifest = json.loads((FIXTURES / "manifest.json").read_text())
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_crossfader"], cwd=ROOT, check=True)
runner = ROOT / "target/debug/examples/render_crossfader"
rendered_dir = ROOT / "target/reference-rendered/crossfader"
rendered_dir.mkdir(parents=True, exist_ok=True)

def samples(path):
    raw = path.read_bytes()
    return struct.unpack(f"<{len(raw) // 4}f", raw)

failed = False
for case in manifest["cases"]:
    rendered = rendered_dir / case["output"]
    args = [FIXTURES / manifest["input"], rendered, case["positionBefore"], case["positionAfter"], case["curve"], case["mix"], manifest["sampleRate"], manifest["blockSize"], manifest["stepFrame"]]
    subprocess.run([str(runner), *(str(arg) for arg in args)], check=True)
    legacy, rust = samples(FIXTURES / case["output"]), samples(rendered)
    if len(legacy) != len(rust):
        raise SystemExit(f"{case['id']}: sample count mismatch")
    differences = [abs(a - b) for a, b in zip(legacy, rust)]
    peak = max(differences)
    rms = math.sqrt(sum(value * value for value in differences) / len(differences))
    print(f"{case['id']:20s} maxAbs={peak:.8f} rmsDiff={rms:.8f}")
    failed |= not math.isfinite(peak) or peak > 0.0002

if failed:
    raise SystemExit("Crossfader parity exceeds 0.0002 maximum sample error")
