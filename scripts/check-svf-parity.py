#!/usr/bin/env python3
"""Compare native Rust renderings with checked-in C++ reference samples."""
import json
import math
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "web/public/reference/svf"
manifest = json.loads((FIXTURES / "manifest.json").read_text())
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_svf"], cwd=ROOT, check=True)
runner = ROOT / "target/debug/examples/render_svf"
rendered_dir = ROOT / "target/reference-rendered"
rendered_dir.mkdir(parents=True, exist_ok=True)

def samples(path):
    raw = path.read_bytes()
    return struct.unpack(f"<{len(raw) // 4}f", raw)

failed = False
for case in manifest["cases"]:
    rendered = rendered_dir / case["output"]
    args = [FIXTURES / manifest["input"], rendered, case["mode"], case["cutoffBefore"], case["cutoffAfter"], case["resonance"], manifest["sampleRate"], case["blockSize"], manifest["stepFrame"]]
    subprocess.run([str(runner), *(str(arg) for arg in args)], check=True)
    legacy, rust = samples(FIXTURES / case["output"]), samples(rendered)
    if len(legacy) != len(rust):
        raise SystemExit(f"{case['id']}: sample count mismatch")
    differences = [abs(a - b) for a, b in zip(legacy, rust)]
    peak = max(differences)
    rms = math.sqrt(sum(value * value for value in differences) / len(differences))
    print(f"{case['id']:9s} maxAbs={peak:.8f} rmsDiff={rms:.8f}")
    failed |= not math.isfinite(peak) or peak > 0.0002

if failed:
    raise SystemExit("SVF parity exceeds 0.0002 maximum sample error")
