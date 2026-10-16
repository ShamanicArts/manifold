#!/usr/bin/env python3
"""Emit original C++ OscillatorNode scalar standard-waveform fixtures."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get("MANIFOLD_LEGACY_DIR", ROOT.parent / "my-plugin"))
OUT = ROOT / "web/public/reference/oscillator"
OUT.mkdir(parents=True, exist_ok=True)
binary = subprocess.check_output(["bash", str(ROOT / "scripts/build-legacy-reference.sh"), "oscillator"], text=True).strip()
source_hash = hashlib.sha256((LEGACY / "dsp/core/nodes/OscillatorNode.cpp").read_bytes()).hexdigest()
specs = [
    ("sine", "Sine", 0, 440, 440, 0.5, 0.5, 128),
    ("saw", "Saw", 1, 440, 440, 0.5, 0.5, 128),
    ("square", "Square", 2, 440, 440, 0.5, 0.5, 128),
    ("triangle", "Triangle", 3, 440, 440, 0.5, 0.5, 128),
    ("blend", "Sine/saw blend", 4, 440, 440, 0.5, 0.5, 128),
    ("sine-sweep", "Sine · frequency/level sweep", 0, 220, 880, 0.25, 0.8, 128),
    ("saw-64", "Saw · 64-frame blocks", 1, 220, 660, 0.5, 0.3, 64),
    ("triangle-512", "Triangle · 512-frame blocks", 3, 220, 660, 0.5, 0.3, 512),
]
cases = []
for case_id, label, waveform, before, after, amp_before, amp_after, block_size in specs:
    output = f"{case_id}.f32"
    args = [before, after, amp_before, amp_after, waveform, 48000, block_size, 2048, 4096]
    subprocess.run([binary, str(OUT / output), *(str(value) for value in args)], check=True)
    cases.append({
        "id": case_id, "label": label, "waveform": waveform, "frequencyBefore": before,
        "frequencyAfter": after, "amplitudeBefore": amp_before, "amplitudeAfter": amp_after,
        "blockSize": block_size, "output": output,
    })
(OUT / "manifest.json").write_text(json.dumps({
    "version": 1, "reference": "legacy C++ OscillatorNode.cpp scalar standard waveform",
    "sourceSha256": source_hash, "sampleRate": 48000, "channels": 2,
    "frames": 4096, "stepFrame": 2048, "input": "input.f32", "cases": cases,
}, indent=2) + "\n")
(OUT / "input.f32").write_bytes(bytes(4096 * 2 * 4))
print(f"Wrote {len(cases)} C++ oscillator cases to {OUT}")
