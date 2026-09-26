#!/usr/bin/env python3
"""Emit native Rust fixtures for typed control modulation."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web/public/reference/modulation"
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_modulation"], cwd=ROOT, check=True)
runner = ROOT / "target/debug/examples/render_modulation"
sources = [ROOT / path for path in ["crates/manifold-core/src/graph.rs", "crates/manifold-core/src/lfo.rs", "crates/manifold-core/src/oscillator.rs", "projects/modulated-gain/project.json", "crates/manifold-core/examples/render_modulation.rs"]]
source_hash = hashlib.sha256(b"".join(path.read_bytes() for path in sources)).hexdigest()
specs = [
    ("sine", "Sine CV", 0, 2, 2, .5, .4, .4, 128),
    ("triangle", "Triangle CV", 1, 2, 2, .5, .4, .4, 128),
    ("square", "Square CV", 2, 2, 2, .5, .4, .4, 128),
    ("rate-sweep", "Rate sweep", 0, 1, 8, .5, .4, .4, 128),
    ("depth-sweep", "Depth and polarity sweep", 0, 4, 4, .5, .25, -.7, 64),
]
keys = ["waveform", "rateBefore", "rateAfter", "base", "depthBefore", "depthAfter", "blockSize"]
cases = []
for case_id, label, *values in specs:
    output = f"{case_id}.f32"
    subprocess.run([runner, str(OUT / output), *(str(value) for value in values), "24576"], check=True)
    cases.append({"id": case_id, "label": label, **dict(zip(keys, values)), "output": output})
(OUT / "manifest.json").write_text(json.dumps({
    "version": 1, "reference": "native Rust typed control graph",
    "sourceSha256": source_hash, "sampleRate": 48000, "channels": 2,
    "frames": 24576, "stepFrame": 12288, "input": "input.f32", "cases": cases,
}, indent=2) + "\n")
(OUT / "input.f32").write_bytes(bytes(24576 * 2 * 4))
print(f"Wrote {len(cases)} native Rust modulation cases to {OUT}")
