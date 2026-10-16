#!/usr/bin/env python3
"""Emit small, reproducible float32 fixtures from the original C++ SVFNode."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get("MANIFOLD_LEGACY_DIR", ROOT.parent / "my-plugin"))
OUT = ROOT / "web/public/reference/svf"
OUT.mkdir(parents=True, exist_ok=True)

binary = subprocess.check_output(["bash", str(ROOT / "scripts/build-legacy-reference.sh")], text=True).strip()
source_hash = hashlib.sha256((LEGACY / "dsp/core/nodes/SVFNode.cpp").read_bytes()).hexdigest()

sample_rate = 48000
frames = 4096
block_size = 128
step_frame = 2048
input_path = OUT / "input.f32"
with input_path.open("wb") as stream:
    for frame in range(frames):
        t = frame / sample_rate
        impulse = 0.18 if frame in (0, 2048) else 0.0
        left = impulse + 0.21 * math.sin(2 * math.pi * 173 * t) + 0.09 * math.sin(2 * math.pi * 3071 * t)
        right = impulse + 0.17 * math.sin(2 * math.pi * 251 * t) + 0.07 * math.sin(2 * math.pi * 5437 * t)
        stream.write(struct.pack("<ff", left, right))

cases = []
case_specs = [(name.lower(), name, mode, block_size) for mode, name in enumerate(("Lowpass", "Bandpass", "Highpass", "Notch"))]
case_specs.extend((f"lowpass-{size}", f"Lowpass · {size} frames", 0, size) for size in (64, 512))
for case_id, label, mode, case_block_size in case_specs:
    output_name = f"{case_id}.f32"
    args = [str(input_path), str(OUT / output_name), str(mode), "3200", "800", "0.75", str(sample_rate), str(case_block_size), str(step_frame)]
    subprocess.run([binary, *args], check=True)
    cases.append({"id": case_id, "label": label, "mode": mode, "blockSize": case_block_size, "cutoffBefore": 3200, "cutoffAfter": 800, "resonance": 0.75, "output": output_name})

manifest = {
    "version": 1,
    "reference": "legacy C++ SVFNode.cpp with Standalone_Filter/dsp/main.lua defaults",
    "sourceSha256": source_hash,
    "sampleRate": sample_rate,
    "channels": 2,
    "frames": frames,
    "blockSize": block_size,
    "stepFrame": step_frame,
    "input": "input.f32",
    "cases": cases,
}
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Wrote {len(cases)} C++ reference cases to {OUT}")
